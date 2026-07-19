const {
    ROOM_PERSISTENCE_VERSION,
    deserializeRoom,
    serializeRoom
} = require('./roomPersistence');
const { isValidRoomId } = require('../config/constants');

const DEFAULT_SCAN_COUNT = 100;

function getLegacySnapshotKey(keyPrefix) {
    return `${keyPrefix}:rooms:snapshot`;
}

function getRoomKeyPrefix(keyPrefix) {
    return `${keyPrefix}:rooms:room:`;
}

function buildRedisRoomKey(keyPrefix, roomId) {
    if (!isValidRoomId(roomId)) {
        throw new Error('A valid room id is required for Redis persistence.');
    }
    return `${getRoomKeyPrefix(keyPrefix)}${encodeURIComponent(roomId)}`;
}

function deserializeRedisRooms(rawPayload, options = {}) {
    if (!rawPayload) return [];

    const parsed = JSON.parse(rawPayload);
    const rawRooms = Array.isArray(parsed) ? parsed : parsed?.rooms;
    if (!Array.isArray(rawRooms)) {
        throw new Error('Redis room snapshot has an invalid format.');
    }

    return rawRooms
        .map(room => deserializeRoom(room, options))
        .filter(Boolean);
}

function serializeRedisRoom(room) {
    const serializedRoom = serializeRoom(room);
    if (!serializedRoom) {
        throw new Error('Cannot persist an invalid Redis room.');
    }

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
    const room = deserializeRoom(rawRoom, options);
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

async function createRedisRoomStore({
    redisClient,
    keyPrefix = 'f1guesserduel',
    roomTtlSeconds = 86_400,
    saveDebounceMs = 250,
    driversRepository = null,
    logger = console
}) {
    if (!redisClient
        || typeof redisClient.get !== 'function'
        || typeof redisClient.set !== 'function'
        || typeof redisClient.del !== 'function') {
        throw new Error('A connected Redis client with get, set and del support is required for room persistence.');
    }

    const restoredRooms = await restoreRedisRooms({
        redisClient,
        keyPrefix,
        roomTtlSeconds,
        driversRepository,
        logger
    });
    const rooms = new Map(restoredRooms.map(room => [room.roomId, room]));
    const pendingUpserts = new Set();
    const pendingDeletes = new Set();
    const debounceMs = Number.isFinite(saveDebounceMs) && saveDebounceMs >= 0 ? saveDebounceMs : 250;
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

    async function drainPendingSaves() {
        while (pendingUpserts.size > 0 || pendingDeletes.size > 0) {
            const upsertIds = [...pendingUpserts];
            const deleteIds = [...pendingDeletes];
            pendingUpserts.clear();
            pendingDeletes.clear();

            const upserts = upsertIds
                .map(roomId => rooms.get(roomId))
                .filter(Boolean)
                .map(room => ({
                    key: buildRedisRoomKey(keyPrefix, room.roomId),
                    payload: JSON.stringify(serializeRedisRoom(room))
                }));
            const deletedKeys = deleteIds.map(roomId => buildRedisRoomKey(keyPrefix, roomId));

            try {
                await executeRedisMutations(redisClient, upserts, deletedKeys, roomTtlSeconds);
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

    function markDirty(roomId = null) {
        const normalizedRoomId = typeof roomId === 'object' ? roomId?.roomId : roomId;
        if (normalizedRoomId && rooms.has(normalizedRoomId)) {
            pendingDeletes.delete(normalizedRoomId);
            pendingUpserts.add(normalizedRoomId);
        } else if (!normalizedRoomId) {
            for (const existingRoomId of rooms.keys()) {
                pendingDeletes.delete(existingRoomId);
                pendingUpserts.add(existingRoomId);
            }
        } else {
            return;
        }
        scheduleSave();
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
        scheduleSave();
        return true;
    }

    function close() {
        if (closePromise) return closePromise;
        isClosing = true;
        clearSaveTimer();
        closePromise = saveNow();
        return closePromise;
    }

    function getLastSaveError() {
        return lastSaveError;
    }

    return {
        provider: 'redis',
        get,
        set,
        remove,
        has,
        values,
        markDirty,
        saveNow,
        close,
        getLastSaveError
    };
}

module.exports = {
    buildRedisRoomKey,
    deserializeRedisRoom,
    deserializeRedisRooms,
    scanRedisRoomKeys,
    createRedisRoomStore
};
