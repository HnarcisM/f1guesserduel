const test = require('node:test');
const assert = require('node:assert/strict');

const {
    REDIS_RATE_LIMIT_SCRIPT,
    hashRateLimitIdentity,
    getDistributedSocketIdentity,
    createRedisRateLimitStore
} = require('../server/socket/redisRateLimitStore');

test('Redis rate limit store increments an expiring counter atomically', async () => {
    const counters = new Map();
    const calls = [];
    const redisClient = {
        async eval(script, options) {
            calls.push({ script, options });
            const key = options.keys[0];
            const count = (counters.get(key) || 0) + 1;
            counters.set(key, count);
            return [count, Number(options.arguments[0])];
        }
    };
    const store = createRedisRateLimitStore({
        redisClient,
        keyPrefix: 'f1-test'
    });

    const first = await store.consume({
        key: 'user:42:submitGuess',
        maxEvents: 1,
        windowMs: 5_000,
        currentTime: 10_000
    });
    const second = await store.consume({
        key: 'user:42:submitGuess',
        maxEvents: 1,
        windowMs: 5_000,
        currentTime: 10_000
    });

    assert.equal(store.provider, 'redis');
    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 0);
    assert.equal(second.allowed, false);
    assert.equal(second.retryAfterMs, 5_000);
    assert.equal(second.resetAt, 15_000);
    assert.equal(calls[0].script, REDIS_RATE_LIMIT_SCRIPT);
    assert.deepEqual(calls[0].options.arguments, ['5000']);
    assert.match(calls[0].options.keys[0], /^f1-test:rate-limit:[a-f0-9]{32}$/);
    assert.equal(calls[0].options.keys[0].includes('user:42'), false);
    assert.match(REDIS_RATE_LIMIT_SCRIPT, /INCR/);
    assert.match(REDIS_RATE_LIMIT_SCRIPT, /PEXPIRE/);
});

test('Redis rate limit store rejects invalid Lua results', async () => {
    const store = createRedisRateLimitStore({
        redisClient: {
            async eval() {
                return ['not-a-counter', null];
            }
        }
    });

    await assert.rejects(
        store.consume({ key: 'socket:event', maxEvents: 10, windowMs: 1_000 }),
        /invalid result/
    );
});

test('distributed socket identity prefers authenticated users and falls back to the address', () => {
    assert.equal(getDistributedSocketIdentity({
        user: { id: 123 },
        handshake: { address: '203.0.113.20' }
    }), 'user:123');
    assert.equal(getDistributedSocketIdentity({
        handshake: { address: '203.0.113.20' },
        id: 'socket-1'
    }), 'anonymous:203.0.113.20');
    assert.equal(getDistributedSocketIdentity({ id: 'socket-1' }), 'anonymous:socket-1');
});

test('rate limit identities are hashed deterministically without storing their raw value', () => {
    const first = hashRateLimitIdentity('user:42:submitGuess');
    const second = hashRateLimitIdentity('user:42:submitGuess');
    const different = hashRateLimitIdentity('user:43:submitGuess');

    assert.equal(first, second);
    assert.notEqual(first, different);
    assert.match(first, /^[a-f0-9]{32}$/);
    assert.equal(first.includes('user'), false);
});
