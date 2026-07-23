const crypto = require('node:crypto');
const {
    ROOM_PERSISTENCE_VERSION,
    deserializeRoom,
    serializeRoom
} = require('./roomPersistence');
const { isValidRoomId } = require('../config/constants');

const DEFAULT_SCAN_COUNT = 100;
const DEFAULT_ROOM_LOCK_TTL_MS = 15_000;
const DEFAULT_ROOM_LOCK_WAIT_TIMEOUT_MS = 5_000;
const DEFAULT_ROOM_LOCK_RETRY_DELAY_MS = 25;
const RELEASE_ROOM_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;
const RENEW_ROOM_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

function getLegacySnapshotKey(keyPrefix) {
    return `${keyPrefix}:rooms:snapshot`;
}

function getRoomKeyPrefix(keyPrefix) {
    return `${keyPrefix}:rooms:room:`;
}

function getRoomSyncChannel(keyPrefix) {
    return `${keyPrefix}:rooms:sync`;
}

function buildRedisRoomKey(keyPrefix, roomId) {
    if (!isValidRoomId(roomId)) {
        throw new Error('A valid room id is required for Redis persistence.');
    }
    return `${getRoomKeyPrefix(keyPrefix)}${encodeURIComponent(roomId)}`;
}

function buildRedisRoomLockKey(keyPrefix, roomId) {
    if (!isValidRoomId(roomId)) {
        throw new Error('A valid room id is required for Redis room locking.');
    }
    return `${keyPrefix}:rooms:lock:${encodeURIComponent(roomId)}`;
}

function cloneRedisSerializable(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return JSON.parse(JSON.stringify(value));
}

function restoreRedisRoomMembers(rawMembers, role, hostId) {
    if (!rawMembers || typeof rawMembers !== 'object' || Array.isArray(rawMembers)) return {};

    return Object.fromEntries(Object.entries(rawMembers)
        .filter(([socketId, member]) => typeof socketId === 'string' && member && typeof member === 'object')
        .map(([socketId, member]) => [socketId, {
            ...cloneRedisSerializable(member, {}),
            socketId,
            role,
            isHost: role === 'player' && socketId === hostId,
            connected: member.connected !== false,
            ready: role === 'player' && member.ready === true
        }]));
}

function hydrateRedisRoom(rawRoom, options = {}) {
    const room = deserializeRoom(rawRoom, options);
    if (!room) return null;

    const hostId = typeof rawRoom?.hostId === 'string' ? rawRoom.hostId : null;
    room.hostId = hostId;
    room.players = restoreRedisRoomMembers(rawRoom?.players, 'player', hostId);
    room.spectators = restoreRedisRoomMembers(rawRoom?.spectators, 'spectator', hostId);
    if (!room.hostId || !room.players[room.hostId]) {
        room.hostId = Object.keys(room.players)[0] || null;
    }
    for (const [socketId, player] of Object.entries(room.players)) {
        player.isHost = socketId === room.hostId;
    }
    return room;
}

function deserializeRedisRooms(rawPayload, options = {}) {
    if (!rawPayload) return [];

    const parsed = JSON.parse(rawPayload);
    const rawRooms = Array.isArray(parsed) ? parsed : parsed?.rooms;
    if (!Array.isArray(rawRooms)) {
        throw new Error('Redis room snapshot has an invalid format.');
    }

    return rawRooms
        .map(room => hydrateRedisRoom(room, options))
        .filter(Boolean);
}

function serializeRedisRoom(room) {
    const serializedRoom = serializeRoom(room);
    if (!serializedRoom) {
        throw new Error('Cannot persist an invalid Redis room.');
    }

    serializedRoom.hostId = typeof room.hostId === 'string' ? room.hostId : null;
    serializedRoom.players = cloneRedisSerializable(room.players || {}, {});
    serializedRoom.spectators = cloneRedisSerializable(room.spectators || {}, {});

    return {
        version: ROOM_PERSISTENCE_VERSION,
        savedAt: new Date().toISOString(),
        room: serializedRoom
    };
}

function deserializeRedisRoom(rawPayload, options = {}) {
    if (!rawPayload) return null;

    const parsed = JSON.parse(rawPayload);
    const rawRoom = parsed?.room || parsed;
    const room = hydrateRedisRoom(rawRoom, options);
    if (!room) {
        throw new Error('Redis room entry has an invalid format.');
    }
    return room;
}

async function scanRedisRoomKeys(redisClient, keyPrefix) {
    const pattern = `${getRoomKeyPrefix(keyPrefix)}*`;
    const keys = [];

    if (typeof redisClient.scanIterator === 'function') {
        for await (const entry of redisClient.scanIterator({ MATCH: pattern, COUNT: DEFAULT_SCAN_COUNT })) {
            const scannedKeys = Array.isArray(entry) ? entry : [entry];
            for (const key of scannedKeys) {
                if (typeof key === 'string' && key.startsWith(getRoomKeyPrefix(keyPrefix))) keys.push(key);
            }
        }
        return [...new Set(keys)];
    }

    if (typeof redisClient.scan !== 'function') {
        throw new Error('Redis room persistence requires SCAN support.');
    }

    let cursor = '0';
    do {
        const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: DEFAULT_SCAN_COUNT });
        const nextCursor = Array.isArray(result) ? result[0] : result?.cursor;
        const scannedKeys = Array.isArray(result) ? result[1] : result?.keys;
        if (!Array.isArray(scannedKeys) || nextCursor === undefined || nextCursor === null) {
            throw new Error('Redis SCAN returned an invalid room key response.');
        }
        for (const key of scannedKeys) {
            if (typeof key === 'string' && key.startsWith(getRoomKeyPrefix(keyPrefix))) keys.push(key);
        }
        cursor = String(nextCursor);
    } while (cursor !== '0');

    return [...new Set(keys)];
}

async function readRedisRoomEntries(redisClient, keys) {
    const entries = [];

    for (let offset = 0; offset < keys.length; offset += DEFAULT_SCAN_COUNT) {
        const batchKeys = keys.slice(offset, offset + DEFAULT_SCAN_COUNT);
        const values = typeof redisClient.mGet === 'function'
            ? await redisClient.mGet(batchKeys)
            : await Promise.all(batchKeys.map(key => redisClient.get(key)));

        if (!Array.isArray(values) || values.length !== batchKeys.length) {
            throw new Error('Redis MGET returned an invalid room response.');
        }

        for (let index = 0; index < batchKeys.length; index += 1) {
            if (values[index]) entries.push([batchKeys[index], values[index]]);
        }
    }

    return entries;
}

async function executeRedisMutations(redisClient, upserts, deletedKeys, roomTtlSeconds) {
    if (upserts.length === 0 && deletedKeys.length === 0) return;

    if (typeof redisClient.multi === 'function') {
        const transaction = redisClient.multi();
        for (const { key, payload } of upserts) {
            transaction.set(key, payload, { EX: roomTtlSeconds });
        }
        for (const key of deletedKeys) transaction.del(key);
        await transaction.exec();
        return;
    }

    await Promise.all(
        upserts.map(({ key, payload }) => redisClient.set(key, payload, { EX: roomTtlSeconds }))
    );
    await Promise.all(deletedKeys.map(key => redisClient.del(key)));
}

async function restoreRedisRooms({ redisClient, keyPrefix, roomTtlSeconds, driversRepository, logger }) {
    const roomKeys = await scanRedisRoomKeys(redisClient, keyPrefix);
    const roomEntries = await readRedisRoomEntries(redisClient, roomKeys);
    const restoredRooms = new Map();

    for (const [key, rawPayload] of roomEntries) {
        const room = deserializeRedisRoom(rawPayload, { driversRepository });
        if (buildRedisRoomKey(keyPrefix, room.roomId) !== key) {
            throw new Error('Redis room key does not match its payload.');
        }
        restoredRooms.set(room.roomId, room);
    }

    const legacySnapshotKey = getLegacySnapshotKey(keyPrefix);
    const legacyPayload = await redisClient.get(legacySnapshotKey);
    if (!legacyPayload) return [...restoredRooms.values()];

    const legacyRooms = deserializeRedisRooms(legacyPayload, { driversRepository });
    const roomsToMigrate = [];
    for (const room of legacyRooms) {
        if (restoredRooms.has(room.roomId)) continue;
        restoredRooms.set(room.roomId, room);
        roomsToMigrate.push({
            key: buildRedisRoomKey(keyPrefix, room.roomId),
            payload: JSON.stringify(serializeRedisRoom(room))
        });
    }

    await executeRedisMutations(redisClient, roomsToMigrate, [legacySnapshotKey], roomTtlSeconds);
    logger?.info?.('[rooms] Snapshot-ul Redis vechi a fost migrat la chei separate.', {
        migratedRoomCount: roomsToMigrate.length
    });
    return [...restoredRooms.values()];
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function acquireRedisRoomLock({
    redisClient,
    keyPrefix,
    roomId,
    lockTtlMs,
    waitTimeoutMs,
    retryDelayMs = DEFAULT_ROOM_LOCK_RETRY_DELAY_MS,
    clock = Date.now
}) {
    const lockKey = buildRedisRoomLockKey(keyPrefix, roomId);
    const token = crypto.randomBytes(24).toString('hex');
    const deadline = clock() + waitTimeoutMs;

    while (clock() <= deadline) {
        const result = await redisClient.set(lockKey, token, { NX: true, PX: lockTtlMs });
        if (result === 'OK' || result === true) {
            return { lockKey, token };
        }
        await delay(retryDelayMs);
    }

    const error = new Error(`Timed out waiting for the distributed lock for room ${roomId}.`);
    error.code = 'ROOM_LOCK_TIMEOUT';
    throw error;
}

function createRoomLockLostError(roomId) {
    const error = new Error(`The distributed lock for room ${roomId} was lost before the mutation completed.`);
    error.code = 'ROOM_LOCK_LOST';
    return error;
}

async function renewRedisRoomLock(redisClient, lock, lockTtlMs) {
    if (!lock) return 0;
    if (typeof redisClient.eval !== 'function') {
        throw new Error('Redis room locking requires EVAL support.');
    }
    return redisClient.eval(RENEW_ROOM_LOCK_SCRIPT, {
        keys: [lock.lockKey],
        arguments: [lock.token, String(lockTtlMs)]
    });
}

async function releaseRedisRoomLock(redisClient, lock) {
    if (!lock) return;
    if (typeof redisClient.eval !== 'function') {
        throw new Error('Redis room locking requires EVAL support.');
    }
    await redisClient.eval(RELEASE_ROOM_LOCK_SCRIPT, {
        keys: [lock.lockKey],
        arguments: [lock.token]
    });
}

function createRedisRoomLockLease({ redisClient, lock, roomId, lockTtlMs }) {
    const renewalIntervalMs = Math.max(10, Math.floor(lockTtlMs / 3));
    let renewalError = null;
    let renewalChain = Promise.resolve();

    function queueRenewal() {
        renewalChain = renewalChain.then(async () => {
            if (renewalError) return;
            const renewed = await renewRedisRoomLock(redisClient, lock, lockTtlMs);
            if (renewed !== 1 && renewed !== true) renewalError = createRoomLockLostError(roomId);
        }).catch(error => {
            renewalError = error;
        });
    }

    const timer = setInterval(queueRenewal, renewalIntervalMs);
    timer.unref?.();

    return {
        async assertOwned() {
            await renewalChain;
            if (renewalError) throw renewalError;
            const renewed = await renewRedisRoomLock(redisClient, lock, lockTtlMs);
            if (renewed !== 1 && renewed !== true) throw createRoomLockLostError(roomId);
        },
        async stop() {
            clearInterval(timer);
            await renewalChain;
        }
    };
}

async function closeRedisSubscriber(client) {
    if (!client) return;
    if (client.isOpen && typeof client.quit === 'function') {
        await client.quit();
        return;
    }
    client.destroy?.();
}

async function createRedisRoomStore({
    redisClient,
    keyPrefix = 'f1guesserduel',
    roomTtlSeconds = 86_400,
    saveDebounceMs = 250,
    driversRepository = null,
    logger = console,
    metrics = null,
    distributedCoordinationEnabled = false,
    roomLockTtlMs = DEFAULT_ROOM_LOCK_TTL_MS,
    roomLockWaitTimeoutMs = DEFAULT_ROOM_LOCK_WAIT_TIMEOUT_MS,
    instanceId = crypto.randomUUID()
}) {
    if (!redisClient
        || typeof redisClient.get !== 'function'
        || typeof redisClient.set !== 'function'
        || typeof redisClient.del !== 'function') {
        throw new Error('A connected Redis client with get, set and del support is required for room persistence.');
    }
    if (distributedCoordinationEnabled
        && (typeof redisClient.duplicate !== 'function'
            || typeof redisClient.publish !== 'function'
            || typeof redisClient.eval !== 'function')) {
        throw new Error('Distributed Redis room coordination requires duplicate, publish and eval support.');
    }
    if (!Number.isFinite(roomLockTtlMs) || roomLockTtlMs <= 0) {
        throw new Error('Redis room lock TTL must be a positive number.');
    }
    if (!Number.isFinite(roomLockWaitTimeoutMs) || roomLockWaitTimeoutMs <= 0) {
        throw new Error('Redis room lock wait timeout must be a positive number.');
    }

    const restoreRooms = () => restoreRedisRooms({
        redisClient,
        keyPrefix,
        roomTtlSeconds,
        driversRepository,
        logger
    });
    const restoredRooms = metrics?.observeDependencyOperation
        ? await metrics.observeDependencyOperation('redis', 'room_restore', restoreRooms)
        : await restoreRooms();
    const rooms = new Map(restoredRooms.map(room => [room.roomId, room]));
    const pendingUpserts = new Set();
    const pendingDeletes = new Set();
    const lockedRoomIds = new Set();
    const debounceMs = Number.isFinite(saveDebounceMs) && saveDebounceMs >= 0 ? saveDebounceMs : 250;
    const syncChannel = getRoomSyncChannel(keyPrefix);
    let syncClient = null;
    let saveTimer = null;
    let savePromise = null;
    let closePromise = null;
    let lastSaveError = null;
    let lastSavedRoomCount = rooms.size;
    let isClosing = false;

    function get(roomId) {
        return rooms.get(roomId) || null;
    }

    function has(roomId) {
        return rooms.has(roomId);
    }

    function values() {
        return [...rooms.values()];
    }

    function clearSaveTimer() {
        if (!saveTimer) return;
        clearTimeout(saveTimer);
        saveTimer = null;
    }

    async function publishRoomSync(action, roomId, payload = null) {
        if (!distributedCoordinationEnabled) return;
        await redisClient.publish(syncChannel, JSON.stringify({
            sourceId: instanceId,
            action,
            roomId,
            payload
        }));
    }

    async function publishMutationBatch(upserts, deletedRoomIds) {
        if (!distributedCoordinationEnabled) return;
        const results = await Promise.allSettled([
            ...upserts.map(({ roomId, payload }) => publishRoomSync('upsert', roomId, payload)),
            ...deletedRoomIds.map(roomId => publishRoomSync('delete', roomId))
        ]);
        const errors = results
            .filter(result => result.status === 'rejected')
            .map(result => result.reason);
        if (errors.length > 0) {
            logger?.error?.('[rooms] Publicarea sincronizării Redis a eșuat; starea persistentă rămâne validă.', {
                error: errors[0],
                failedMessageCount: errors.length
            });
        }
    }

    async function drainPendingSaves() {
        while (pendingUpserts.size > 0 || pendingDeletes.size > 0) {
            const upsertIds = [...pendingUpserts].filter(roomId => !lockedRoomIds.has(roomId));
            const deleteIds = [...pendingDeletes].filter(roomId => !lockedRoomIds.has(roomId));
            if (upsertIds.length === 0 && deleteIds.length === 0) break;

            for (const roomId of upsertIds) pendingUpserts.delete(roomId);
            for (const roomId of deleteIds) pendingDeletes.delete(roomId);

            const upserts = upsertIds
                .map(roomId => rooms.get(roomId))
                .filter(Boolean)
                .map(room => ({
                    roomId: room.roomId,
                    key: buildRedisRoomKey(keyPrefix, room.roomId),
                    payload: JSON.stringify(serializeRedisRoom(room))
                }));
            const deletedKeys = deleteIds.map(roomId => buildRedisRoomKey(keyPrefix, roomId));

            try {
                const persistRooms = () => executeRedisMutations(
                    redisClient,
                    upserts,
                    deletedKeys,
                    roomTtlSeconds
                );
                if (metrics?.observeDependencyOperation) {
                    await metrics.observeDependencyOperation('redis', 'room_persist', persistRooms);
                } else {
                    await persistRooms();
                }
                await publishMutationBatch(upserts, deleteIds);
                lastSavedRoomCount = rooms.size;
                lastSaveError = null;
            } catch (error) {
                for (const roomId of upsertIds) {
                    if (rooms.has(roomId) && !pendingDeletes.has(roomId)) pendingUpserts.add(roomId);
                }
                for (const roomId of deleteIds) {
                    if (!rooms.has(roomId) && !pendingUpserts.has(roomId)) pendingDeletes.add(roomId);
                }
                lastSaveError = error;
                throw error;
            }
        }

        return lastSavedRoomCount;
    }

    function saveNow() {
        clearSaveTimer();
        if (pendingUpserts.size === 0 && pendingDeletes.size === 0 && !savePromise) {
            return Promise.resolve(lastSavedRoomCount);
        }

        if (!savePromise) {
            const trackedSave = drainPendingSaves().finally(() => {
                if (savePromise === trackedSave) savePromise = null;
            });
            savePromise = trackedSave;
        }
        return savePromise;
    }

    function startSave() {
        saveNow().catch(error => {
            logger?.error?.('[rooms] Nu am putut salva camerele Redis.', { error });
        });
    }

    function scheduleSave() {
        if (saveTimer || isClosing) return;
        if (debounceMs === 0) {
            startSave();
            return;
        }

        saveTimer = setTimeout(() => {
            saveTimer = null;
            startSave();
        }, debounceMs);
        saveTimer.unref?.();
    }

    function markDirty(roomId = null, { touchActivity = true } = {}) {
        const normalizedRoomId = typeof roomId === 'object' ? roomId?.roomId : roomId;
        if (normalizedRoomId && rooms.has(normalizedRoomId)) {
            if (touchActivity) rooms.get(normalizedRoomId).inactiveSince = null;
            pendingDeletes.delete(normalizedRoomId);
            pendingUpserts.add(normalizedRoomId);
        } else if (!normalizedRoomId) {
            for (const existingRoomId of rooms.keys()) {
                if (touchActivity) rooms.get(existingRoomId).inactiveSince = null;
                pendingDeletes.delete(existingRoomId);
                pendingUpserts.add(existingRoomId);
            }
        } else {
            return;
        }
        if (!normalizedRoomId || !lockedRoomIds.has(normalizedRoomId)) scheduleSave();
    }

    function set(roomId, room) {
        rooms.set(roomId, room);
        markDirty(roomId);
        return room;
    }

    function remove(roomId) {
        const removed = rooms.delete(roomId);
        if (!removed) return false;
        pendingUpserts.delete(roomId);
        pendingDeletes.add(roomId);
        if (!lockedRoomIds.has(roomId)) scheduleSave();
        return true;
    }

    async function refreshRoom(roomId) {
        const rawPayload = await redisClient.get(buildRedisRoomKey(keyPrefix, roomId));
        if (!rawPayload) {
            rooms.delete(roomId);
            return null;
        }
        const room = deserializeRedisRoom(rawPayload, { driversRepository });
        rooms.set(roomId, room);
        return room;
    }

    async function refreshAll() {
        if (!distributedCoordinationEnabled) return values();
        const keys = await scanRedisRoomKeys(redisClient, keyPrefix);
        const entries = await readRedisRoomEntries(redisClient, keys);
        const refreshedRoomIds = new Set();

        for (const [, payload] of entries) {
            const room = deserializeRedisRoom(payload, { driversRepository });
            refreshedRoomIds.add(room.roomId);
            if (!lockedRoomIds.has(room.roomId)) rooms.set(room.roomId, room);
        }
        for (const roomId of [...rooms.keys()]) {
            if (!refreshedRoomIds.has(roomId) && !lockedRoomIds.has(roomId)) rooms.delete(roomId);
        }
        return values();
    }

    async function persistRoomImmediately(roomId) {
        pendingUpserts.delete(roomId);
        pendingDeletes.delete(roomId);
        const room = rooms.get(roomId);

        if (!room) {
            await redisClient.del(buildRedisRoomKey(keyPrefix, roomId));
            await publishMutationBatch([], [roomId]);
            lastSavedRoomCount = rooms.size;
            return null;
        }

        const payload = JSON.stringify(serializeRedisRoom(room));
        await redisClient.set(buildRedisRoomKey(keyPrefix, roomId), payload, { EX: roomTtlSeconds });
        await publishMutationBatch([{ roomId, payload }], []);
        lastSavedRoomCount = rooms.size;
        return room;
    }

    async function runExclusive(roomId, callback) {
        if (!isValidRoomId(roomId)) {
            throw new Error('A valid room id is required for a coordinated room mutation.');
        }
        if (typeof callback !== 'function') {
            throw new Error('A room mutation callback is required.');
        }
        if (!distributedCoordinationEnabled) {
            return callback(get(roomId));
        }

        const lock = await acquireRedisRoomLock({
            redisClient,
            keyPrefix,
            roomId,
            lockTtlMs: roomLockTtlMs,
            waitTimeoutMs: roomLockWaitTimeoutMs
        });
        lockedRoomIds.add(roomId);
        const lockLease = createRedisRoomLockLease({
            redisClient,
            lock,
            roomId,
            lockTtlMs: roomLockTtlMs
        });

        try {
            await refreshRoom(roomId);
            pendingUpserts.delete(roomId);
            pendingDeletes.delete(roomId);
            const result = await callback(get(roomId));
            await lockLease.assertOwned();
            await persistRoomImmediately(roomId);
            lastSaveError = null;
            return result;
        } catch (error) {
            lastSaveError = error;
            pendingUpserts.delete(roomId);
            pendingDeletes.delete(roomId);
            try {
                await refreshRoom(roomId);
            } catch (refreshError) {
                logger?.error?.('[rooms] Nu am putut reîncărca camera după o mutație eșuată.', {
                    error: refreshError,
                    roomId
                });
            }
            throw error;
        } finally {
            await lockLease.stop();
            lockedRoomIds.delete(roomId);
            try {
                await releaseRedisRoomLock(redisClient, lock);
            } catch (releaseError) {
                logger?.error?.('[rooms] Eliberarea lock-ului Redis a eșuat; TTL-ul îl va elimina automat.', {
                    error: releaseError,
                    roomId
                });
            }
        }
    }

    async function initializeRoomSync() {
        if (!distributedCoordinationEnabled) return;
        syncClient = redisClient.duplicate();
        syncClient.on?.('error', error => {
            logger?.error?.('[rooms] Redis room synchronization client error.', { error });
        });
        if (!syncClient.isOpen) await syncClient.connect();
        await syncClient.subscribe(syncChannel, message => {
            try {
                const event = JSON.parse(message);
                if (!event || event.sourceId === instanceId || !isValidRoomId(event.roomId)) return;
                if (lockedRoomIds.has(event.roomId)) return;

                if (event.action === 'delete') {
                    rooms.delete(event.roomId);
                    pendingUpserts.delete(event.roomId);
                    pendingDeletes.delete(event.roomId);
                    return;
                }
                if (event.action === 'upsert' && typeof event.payload === 'string') {
                    const room = deserializeRedisRoom(event.payload, { driversRepository });
                    rooms.set(event.roomId, room);
                    pendingUpserts.delete(event.roomId);
                    pendingDeletes.delete(event.roomId);
                }
            } catch (error) {
                logger?.error?.('[rooms] Mesaj Redis de sincronizare invalid.', { error });
            }
        });
        logger?.info?.('[rooms] Sincronizarea distribuită Redis este activă.', {
            channel: syncChannel
        });
    }

    await initializeRoomSync();

    function close() {
        if (closePromise) return closePromise;
        isClosing = true;
        clearSaveTimer();
        closePromise = (async () => {
            await saveNow();
            await closeRedisSubscriber(syncClient);
            return lastSavedRoomCount;
        })();
        return closePromise;
    }

    function getLastSaveError() {
        return lastSaveError;
    }

    return {
        provider: 'redis',
        distributedCoordinationEnabled,
        get,
        set,
        remove,
        has,
        values,
        markDirty,
        saveNow,
        refreshRoom,
        refreshAll,
        runExclusive,
        close,
        getLastSaveError
    };
}

module.exports = {
    buildRedisRoomKey,
    buildRedisRoomLockKey,
    deserializeRedisRoom,
    deserializeRedisRooms,
    scanRedisRoomKeys,
    acquireRedisRoomLock,
    renewRedisRoomLock,
    releaseRedisRoomLock,
    createRedisRoomStore,
    DEFAULT_ROOM_LOCK_TTL_MS,
    DEFAULT_ROOM_LOCK_WAIT_TIMEOUT_MS
};
