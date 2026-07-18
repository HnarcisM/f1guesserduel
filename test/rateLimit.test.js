const test = require('node:test');
const assert = require('node:assert/strict');

const { createMemoryRateLimiter } = require('../server/middleware/rateLimit');
const { createAuthRoutes } = require('../server/auth/authRoutes');

function createMockResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

function runLimiter(limiter, req = { ip: '127.0.0.1' }) {
    const res = createMockResponse();
    let nextCalled = false;
    limiter(req, res, () => {
        nextCalled = true;
    });

    return { res, nextCalled };
}

async function runAsyncLimiter(limiter, req = { ip: '127.0.0.1' }) {
    const res = createMockResponse();
    let nextCalled = false;
    await limiter(req, res, () => {
        nextCalled = true;
    });

    return { res, nextCalled };
}

test('rate limiter allows requests up to the configured limit', () => {
    let currentTime = 1000;
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 2,
        clock: () => currentTime
    });

    const first = runLimiter(limiter);
    const second = runLimiter(limiter);

    assert.equal(first.nextCalled, true);
    assert.equal(second.nextCalled, true);
    assert.equal(first.res.statusCode, 200);
    assert.equal(second.res.statusCode, 200);
});

test('rate limiter blocks requests after the configured limit', () => {
    let currentTime = 1000;
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        message: 'Blocked for test.',
        clock: () => currentTime
    });

    runLimiter(limiter);
    const blocked = runLimiter(limiter);

    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.deepEqual(blocked.res.body, { message: 'Blocked for test.' });
    assert.equal(blocked.res.headers['Retry-After'], '60');
});

test('rate limiter resets after the window expires', () => {
    let currentTime = 1000;
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        clock: () => currentTime
    });

    runLimiter(limiter);
    const blocked = runLimiter(limiter);

    currentTime += 60_001;
    const allowedAfterReset = runLimiter(limiter);

    assert.equal(blocked.res.statusCode, 429);
    assert.equal(allowedAfterReset.nextCalled, true);
    assert.equal(allowedAfterReset.res.statusCode, 200);
});

test('rate limiter uses separate buckets for different IPs', () => {
    let currentTime = 1000;
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        clock: () => currentTime
    });

    runLimiter(limiter, { ip: '10.0.0.1' });
    const otherIp = runLimiter(limiter, { ip: '10.0.0.2' });

    assert.equal(otherIp.nextCalled, true);
    assert.equal(otherIp.res.statusCode, 200);
});

test('HTTP rate limiter supports an asynchronous distributed store', async () => {
    const consumed = [];
    const results = [
        { allowed: true, remaining: 0, retryAfterMs: 0, resetAt: 61_000 },
        { allowed: false, remaining: 0, retryAfterMs: 5_000, resetAt: 61_000 }
    ];
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        keyPrefix: 'auth-login',
        clock: () => 1_000,
        store: {
            provider: 'redis',
            async consume(options) {
                consumed.push(options);
                return results.shift();
            }
        }
    });

    const first = await runAsyncLimiter(limiter, { ip: '203.0.113.10' });
    const second = await runAsyncLimiter(limiter, { ip: '203.0.113.10' });

    assert.equal(first.nextCalled, true);
    assert.equal(second.nextCalled, false);
    assert.equal(second.res.statusCode, 429);
    assert.equal(second.res.headers['Retry-After'], '5');
    assert.equal(second.res.headers['X-RateLimit-Remaining'], '0');
    assert.deepEqual(consumed[0], {
        key: 'auth-login:203.0.113.10',
        maxEvents: 1,
        windowMs: 60_000,
        currentTime: 1_000
    });
});

test('HTTP rate limiter falls back to memory and throttles logs when Redis fails', async () => {
    const logs = [];
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        keyPrefix: 'auth-register',
        clock: () => 1_000,
        store: {
            provider: 'redis',
            async consume() {
                throw new Error('Redis unavailable');
            }
        },
        logger: {
            error(message, context) {
                logs.push({ message, context });
            }
        }
    });

    const first = await runAsyncLimiter(limiter);
    const second = await runAsyncLimiter(limiter);

    assert.equal(first.nextCalled, true);
    assert.equal(second.nextCalled, false);
    assert.equal(second.res.statusCode, 429);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].context.provider, 'redis');
    assert.equal(logs[0].context.fallback, 'memory');
    assert.equal(JSON.stringify(logs).includes('127.0.0.1'), false);
});

test('HTTP rate limiter can fail closed when an external store is unavailable', async () => {
    const limiter = createMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        failOpen: false,
        store: {
            async consume() {
                throw new Error('store unavailable');
            }
        },
        logger: { error() {} }
    });

    const result = await runAsyncLimiter(limiter);

    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 429);
    assert.equal(result.res.headers['Retry-After'], '60');
});

test('auth routes share the distributed store with isolated login and register limits', async () => {
    const consumed = [];
    const rateLimitStore = {
        provider: 'redis',
        async consume(options) {
            consumed.push(options);
            return {
                allowed: true,
                remaining: options.maxEvents - 1,
                retryAfterMs: 0,
                resetAt: Date.now() + options.windowMs
            };
        }
    };
    const router = createAuthRoutes({
        authService: {},
        sessionService: {
            cookieName: 'session',
            maxAgeMs: 60_000,
            async createSocketAuthToken() {
                return null;
            }
        },
        rateLimitStore,
        logger: { error() {} }
    });
    const loginRoute = router.stack.find(layer => layer.route?.path === '/login');
    const registerRoute = router.stack.find(layer => layer.route?.path === '/register');
    const loginLimiter = loginRoute.route.stack[0].handle;
    const registerLimiter = registerRoute.route.stack[0].handle;

    await runAsyncLimiter(loginLimiter, { ip: '198.51.100.7' });
    await runAsyncLimiter(registerLimiter, { ip: '198.51.100.7' });

    assert.equal(consumed[0].key, 'auth-login:198.51.100.7');
    assert.equal(consumed[0].maxEvents, 5);
    assert.equal(consumed[0].windowMs, 10 * 60 * 1000);
    assert.equal(consumed[1].key, 'auth-register:198.51.100.7');
    assert.equal(consumed[1].maxEvents, 3);
    assert.equal(consumed[1].windowMs, 10 * 60 * 1000);
});
