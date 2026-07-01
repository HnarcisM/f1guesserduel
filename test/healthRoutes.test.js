const test = require('node:test');
const assert = require('node:assert/strict');

const { createHealthPayload, createHealthHandler } = require('../server/routes/healthRoutes');

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

test('health payload reports ok status with uptime and timestamp', () => {
    const payload = createHealthPayload({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 42.9
    });

    assert.deepEqual(payload, {
        status: 'ok',
        uptimeSeconds: 42,
        timestamp: '2026-07-01T12:00:00.000Z'
    });
});

test('health handler responds with no-store cache headers', () => {
    const res = createMockResponse();
    const handler = createHealthHandler({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 10
    });

    handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.uptimeSeconds, 10);
});
