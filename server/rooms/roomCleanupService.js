const {
    getPlayerIds,
    getSpectatorIds
} = require('./memberService');
const { removeInactiveRoomMembers } = require('./roomService');
const {
    DEFAULT_ROOM_CLEANUP_INTERVAL_MS,
    DEFAULT_ROOM_INACTIVE_TTL_MS
} = require('../config/appConfig');

function createRoomCleanupService({
    roomStore,
    isSocketActive = null,
    resolveActiveSocketIds = null,
    cleanupIntervalMs = DEFAULT_ROOM_CLEANUP_INTERVAL_MS,
    inactiveTtlMs = DEFAULT_ROOM_INACTIVE_TTL_MS,
    logger = console,
    metrics = null,
    clock = Date.now,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
} = {}) {
    if (!roomStore
        || typeof roomStore.values !== 'function'
        || typeof roomStore.remove !== 'function'
        || (typeof isSocketActive !== 'function' && typeof resolveActiveSocketIds !== 'function')) {
        throw new Error('Room cleanup requires a room store and an active socket resolver.');
    }

    const effectiveCleanupIntervalMs = Number.isFinite(cleanupIntervalMs) && cleanupIntervalMs >= 0
        ? cleanupIntervalMs
        : DEFAULT_ROOM_CLEANUP_INTERVAL_MS;
    const effectiveInactiveTtlMs = Number.isFinite(inactiveTtlMs) && inactiveTtlMs > 0
        ? inactiveTtlMs
        : DEFAULT_ROOM_INACTIVE_TTL_MS;
    let cleanupTimer = null;

    function createStats() {
        return {
            scannedRoomCount: 0,
            updatedRoomCount: 0,
            removedRoomCount: 0
        };
    }

    function cleanupRoom(room, activeResolver, now, stats) {
        if (!room?.roomId) return;
        stats.scannedRoomCount += 1;
        let changed = removeInactiveRoomMembers(room, activeResolver, now, {
            onMemberExpired: event => metrics?.recordReconnect?.({
                ...event,
                outcome: 'grace_expired'
            })
        });
        const socketIds = [
            ...getPlayerIds(room),
            ...getSpectatorIds(room)
        ];
        const hasActiveSocket = socketIds.some(socketId => activeResolver(socketId));

        if (hasActiveSocket) {
            if (room.inactiveSince !== null && room.inactiveSince !== undefined) {
                room.inactiveSince = null;
                changed = true;
            }
        } else {
            if (!Number.isFinite(room.inactiveSince)) {
                room.inactiveSince = now;
                changed = true;
            }

            if (now - room.inactiveSince >= effectiveInactiveTtlMs) {
                if (roomStore.remove(room.roomId)) {
                    stats.removedRoomCount += 1;
                    metrics?.recordRoomEvent?.('inactive_cleanup');
                }
                return;
            }
        }

        if (changed) {
            roomStore.markDirty?.(room.roomId, { touchActivity: false });
            stats.updatedRoomCount += 1;
        }
    }

    function logCleanup(stats) {
        if (stats.removedRoomCount > 0) {
            logger?.info?.('[rooms] Camere inactive eliminate periodic.', {
                removedRoomCount: stats.removedRoomCount,
                scannedRoomCount: stats.scannedRoomCount
            });
        }
        return stats;
    }

    function cleanupInactiveRoomsSync(currentTime = clock()) {
        const now = Number.isFinite(currentTime) ? currentTime : clock();
        const stats = createStats();
        for (const room of roomStore.values()) cleanupRoom(room, isSocketActive, now, stats);
        return logCleanup(stats);
    }

    async function cleanupInactiveRoomsDistributed(currentTime = clock()) {
        const now = Number.isFinite(currentTime) ? currentTime : clock();
        const stats = createStats();
        await roomStore.refreshAll?.();
        const resolvedSocketIds = await resolveActiveSocketIds();
        const activeSocketIds = resolvedSocketIds instanceof Set
            ? resolvedSocketIds
            : new Set(Array.isArray(resolvedSocketIds) ? resolvedSocketIds : []);
        const activeResolver = socketId => activeSocketIds.has(socketId);
        const roomIds = roomStore.values()
            .map(room => room?.roomId)
            .filter(Boolean);

        for (const roomId of roomIds) {
            if (typeof roomStore.runExclusive === 'function') {
                await roomStore.runExclusive(roomId, () => {
                    const room = roomStore.get(roomId);
                    if (room) cleanupRoom(room, activeResolver, now, stats);
                });
            } else {
                const room = roomStore.get(roomId);
                if (room) cleanupRoom(room, activeResolver, now, stats);
            }
        }
        return logCleanup(stats);
    }

    function cleanupInactiveRooms(currentTime = clock()) {
        if (typeof resolveActiveSocketIds === 'function') {
            return cleanupInactiveRoomsDistributed(currentTime);
        }
        return cleanupInactiveRoomsSync(currentTime);
    }

    function runCleanupSafely() {
        try {
            const result = cleanupInactiveRooms();
            if (result && typeof result.then === 'function') {
                return result.catch(error => {
                    logger?.error?.('[rooms] Curățarea periodică a camerelor a eșuat.', { error });
                    return null;
                });
            }
            return result;
        } catch (error) {
            logger?.error?.('[rooms] Curățarea periodică a camerelor a eșuat.', { error });
            return null;
        }
    }

    function stop() {
        if (!cleanupTimer) return;
        clearIntervalFn(cleanupTimer);
        cleanupTimer = null;
    }

    function start() {
        if (cleanupTimer || effectiveCleanupIntervalMs <= 0) return stop;
        cleanupTimer = setIntervalFn(runCleanupSafely, effectiveCleanupIntervalMs);
        cleanupTimer?.unref?.();
        return stop;
    }

    return {
        cleanupInactiveRooms,
        runCleanupSafely,
        start,
        stop
    };
}

module.exports = {
    createRoomCleanupService
};
