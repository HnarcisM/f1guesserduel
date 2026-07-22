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
    isSocketActive,
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
        || typeof isSocketActive !== 'function') {
        throw new Error('Room cleanup requires a room store and an active socket resolver.');
    }

    const effectiveCleanupIntervalMs = Number.isFinite(cleanupIntervalMs) && cleanupIntervalMs >= 0
        ? cleanupIntervalMs
        : DEFAULT_ROOM_CLEANUP_INTERVAL_MS;
    const effectiveInactiveTtlMs = Number.isFinite(inactiveTtlMs) && inactiveTtlMs > 0
        ? inactiveTtlMs
        : DEFAULT_ROOM_INACTIVE_TTL_MS;
    let cleanupTimer = null;

    function hasActiveSocket(room) {
        const socketIds = [
            ...getPlayerIds(room),
            ...getSpectatorIds(room)
        ];
        return socketIds.some(socketId => isSocketActive(socketId));
    }

    function cleanupInactiveRooms(currentTime = clock()) {
        const now = Number.isFinite(currentTime) ? currentTime : clock();
        const stats = {
            scannedRoomCount: 0,
            updatedRoomCount: 0,
            removedRoomCount: 0
        };

        for (const room of roomStore.values()) {
            if (!room?.roomId) continue;
            stats.scannedRoomCount += 1;
            let changed = removeInactiveRoomMembers(room, isSocketActive, now, {
                onMemberExpired: event => metrics?.recordReconnect?.({
                    ...event,
                    outcome: 'grace_expired'
                })
            });

            if (hasActiveSocket(room)) {
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
                    continue;
                }
            }

            if (changed) {
                roomStore.markDirty?.(room.roomId, { touchActivity: false });
                stats.updatedRoomCount += 1;
            }
        }

        if (stats.removedRoomCount > 0) {
            logger?.info?.('[rooms] Camere inactive eliminate periodic.', {
                removedRoomCount: stats.removedRoomCount,
                scannedRoomCount: stats.scannedRoomCount
            });
        }

        return stats;
    }

    function runCleanupSafely() {
        try {
            return cleanupInactiveRooms();
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
