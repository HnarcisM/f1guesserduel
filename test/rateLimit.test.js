const test = require('node:test');
const assert = require('node:assert/strict');

const { createMemoryRateLimiter } = require('../server/middleware/rateLimit');

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
