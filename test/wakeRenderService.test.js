const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_HEALTH_URL,
    requestHealth,
    resolveHealthUrl,
    validateHealthPayload,
    wakeRenderService
} = require('../scripts/wake-render-service');

function jsonResponse(payload, { status = 200 } = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

test('keep-alive uses the production health endpoint by default and permits localhost tests', () => {
    assert.equal(resolveHealthUrl({}), DEFAULT_HEALTH_URL);
    assert.equal(resolveHealthUrl({ RENDER_HEALTH_URL: 'http://127.0.0.1:3000/api/health' }), 'http://127.0.0.1:3000/api/health');
    assert.throws(
        () => resolveHealthUrl({ RENDER_HEALTH_URL: 'http://example.com/api/health' }),
        /HTTPS/
    );
});

test('health payload requires both the application and Redis to report ok', () => {
    const payload = {
        status: 'ok',
        uptimeSeconds: 42,
        checks: { redis: { status: 'ok' } }
    };

    assert.equal(validateHealthPayload(payload), payload);
    assert.throws(
        () => validateHealthPayload({ status: 'degraded', checks: { redis: { status: 'ok' } } }),
        /degraded/
    );
    assert.throws(
        () => validateHealthPayload({ status: 'ok', checks: {} }),
        /Redis/
    );
});

test('requestHealth rejects Render loading HTML and accepts a valid Redis health response', async () => {
    await assert.rejects(
        () => requestHealth({
            url: DEFAULT_HEALTH_URL,
            timeoutMs: 1000,
            fetchFn: async () => new Response('<html>Loading...</html>', { status: 200 })
        }),
        /JSON valid/
    );

    const payload = await requestHealth({
        url: DEFAULT_HEALTH_URL,
        timeoutMs: 1000,
        fetchFn: async () => jsonResponse({
            status: 'ok',
            uptimeSeconds: 7,
            checks: { redis: { status: 'ok' } }
        })
    });
    assert.equal(payload.checks.redis.status, 'ok');
});

test('wakeRenderService retries a cold start and preserves Redis validation', async () => {
    const responses = [
        new Response('Service unavailable', { status: 503 }),
        jsonResponse({ status: 'ok', uptimeSeconds: 3, checks: { redis: { status: 'ok' } } })
    ];
    const waits = [];
    const logs = [];

    const payload = await wakeRenderService({
        url: DEFAULT_HEALTH_URL,
        attempts: 3,
        timeoutMs: 1000,
        retryDelayMs: 25,
        fetchFn: async () => responses.shift(),
        sleep: async milliseconds => waits.push(milliseconds),
        logger: {
            log: message => logs.push(message),
            warn: message => logs.push(message)
        }
    });

    assert.equal(payload.status, 'ok');
    assert.deepEqual(waits, [25]);
    assert.ok(logs.some(message => message.includes('Redis OK')));
});

test('wakeRenderService fails after all attempts when Redis remains degraded', async () => {
    await assert.rejects(
        () => wakeRenderService({
            url: DEFAULT_HEALTH_URL,
            attempts: 2,
            timeoutMs: 1000,
            retryDelayMs: 0,
            fetchFn: async () => jsonResponse({
                status: 'ok',
                checks: { redis: { status: 'error' } }
            }),
            sleep: async () => {},
            logger: { log() {}, warn() {} }
        }),
        /după 2 încercări.*Redis/
    );
});
