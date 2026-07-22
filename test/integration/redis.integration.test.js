const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');

const { createRedisClient, closeRedisClient } = require('../../server/redis/redisClient');
const { createRoom } = require('../../server/rooms/roomService');
const {
    buildRedisRoomKey,
    createRedisRoomStore
} = require('../../server/rooms/roomStore.redis');
const { createRedisRateLimitStore } = require('../../server/socket/redisRateLimitStore');

const redisUrl = process.env.TEST_REDIS_URL;
const keyPrefix = `f1guesser-ci:${process.pid}:${randomUUID()}`;
const silentLogger = { info() {}, error() {} };

let redisClient;

async function deleteTestKeys() {
    if (!redisClient?.isOpen) return;

    const testKeys = [];
    for await (const entry of redisClient.scanIterator({
        MATCH: `${keyPrefix}:*`,
        COUNT: 100
    })) {
        testKeys.push(...(Array.isArray(entry) ? entry : [entry]));
    }
    await Promise.all(testKeys.map(key => redisClient.del(key)));
}

before(async () => {
    assert.ok(redisUrl, 'TEST_REDIS_URL is required for real Redis integration tests.');
    redisClient = await createRedisClient({
        url: redisUrl,
        connectTimeoutMs: 5_000,
        logger: silentLogger
    });
});

after(async () => {
    await deleteTestKeys();
    await closeRedisClient(redisClient);
});

test('real Redis persists rooms with TTL and restores them from separate keys', async () => {
    assert.equal(await redisClient.ping(), 'PONG');

    const roomId = 'ci-room';
    const roomKey = buildRedisRoomKey(keyPrefix, roomId);
    const firstStore = await createRedisRoomStore({
        redisClient,
        keyPrefix,
        roomTtlSeconds: 60,
        saveDebounceMs: 60_000,
        logger: silentLogger
    });

    firstStore.set(roomId, createRoom(roomId, 'ci-socket'));
    assert.equal(await firstStore.saveNow(), 1);
    assert.equal(await redisClient.exists(roomKey), 1);

    const ttlSeconds = await redisClient.ttl(roomKey);
    assert.ok(ttlSeconds > 0 && ttlSeconds <= 60);
    await firstStore.close();

    const restoredStore = await createRedisRoomStore({
        redisClient,
        keyPrefix,
        roomTtlSeconds: 60,
        saveDebounceMs: 60_000,
        logger: silentLogger
    });
    assert.equal(restoredStore.get(roomId)?.roomId, roomId);

    assert.equal(restoredStore.remove(roomId), true);
    assert.equal(await restoredStore.saveNow(), 0);
    assert.equal(await redisClient.exists(roomKey), 0);
    await restoredStore.close();
});

test('real Redis applies distributed rate limits atomically with an expiring key', async () => {
    const store = createRedisRateLimitStore({ redisClient, keyPrefix });
    const request = {
        key: 'ci-user:submitGuess',
        maxEvents: 1,
        windowMs: 5_000,
        currentTime: Date.now()
    };

    const first = await store.consume(request);
    const second = await store.consume(request);

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 0);
    assert.equal(second.allowed, false);
    assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= request.windowMs);

    const rateLimitKeys = [];
    for await (const entry of redisClient.scanIterator({
        MATCH: `${keyPrefix}:rate-limit:*`,
        COUNT: 100
    })) {
        rateLimitKeys.push(...(Array.isArray(entry) ? entry : [entry]));
    }
    assert.equal(rateLimitKeys.length, 1);
    assert.ok(await redisClient.pTTL(rateLimitKeys[0]) > 0);
});
