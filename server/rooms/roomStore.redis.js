const {
    deserializeRoom,
    serializeRooms
} = require('./roomPersistence');
const { createPersistentRoomStore } = require('./roomStore.persistent');

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

async function createRedisRoomStore({
    redisClient,
    keyPrefix = 'f1guesserduel',
    roomTtlSeconds = 86_400,
    saveDebounceMs = 250,
    driversRepository = null,
    logger = console
}) {
    if (!redisClient || typeof redisClient.get !== 'function' || typeof redisClient.set !== 'function') {
        throw new Error('A connected Redis client is required for Redis room persistence.');
    }

    const redisKey = `${keyPrefix}:rooms:snapshot`;
    const initialRooms = deserializeRedisRooms(await redisClient.get(redisKey), {
        driversRepository
    });
    const store = createPersistentRoomStore({
        persistenceFilePath: redisKey,
        saveDebounceMs,
        driversRepository,
        initialRooms,
        logger,
        async writePersistedRooms(key, rooms) {
            const payload = serializeRooms(rooms);
            await redisClient.set(key, JSON.stringify(payload), { EX: roomTtlSeconds });
            return payload.rooms.length;
        }
    });

    return {
        ...store,
        provider: 'redis'
    };
}

module.exports = {
    deserializeRedisRooms,
    createRedisRoomStore
};
