const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
    createRequestLoggingMiddleware,
    getRequestPath,
    resolveRequestId
} = require('../server/middleware/requestLogging');

function createMockResponse() {
    const res = new EventEmitter();
    res.headers = {};
    res.statusCode = 200;
    res.setHeader = (name, value) => {
        res.headers[name] = value;
    };
    return res;
}

test('request logging sets request id and logs sanitized path without query string', () => {
    const logs = [];
    let currentTime = 1000;
    const req = {
        headers: { 'x-request-id': 'req-123' },
        method: 'GET',
        originalUrl: '/api/health?token=secret',
        ip: '127.0.0.1'
    };
    const res = createMockResponse();
    const middleware = createRequestLoggingMiddleware({
        logger: { info: (message, meta) => logs.push({ message, meta }) },
        clock: () => currentTime
    });

    middleware(req, res, () => {});
    currentTime = 1034;
    res.emit('finish');

    assert.equal(req.requestId, 'req-123');
    assert.equal(res.headers['X-Request-Id'], 'req-123');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].message, 'HTTP request completed');
    assert.deepEqual(logs[0].meta, {
        requestId: 'req-123',
        method: 'GET',
        path: '/api/health',
        statusCode: 200,
        durationMs: 34,
        ip: '127.0.0.1'
    });
});

test('request logging uses warn level for 4xx and can be disabled', () => {
    const logs = [];
    const req = { headers: {}, method: 'POST', url: '/api/auth/login?password=secret' };
    const res = createMockResponse();
    res.statusCode = 401;
    const middleware = createRequestLoggingMiddleware({
        logger: { warn: (message, meta) => logs.push({ message, meta }) },
        clock: () => 1
    });

    middleware(req, res, () => {});
    res.emit('finish');

    assert.equal(logs.length, 1);
    assert.equal(logs[0].meta.path, '/api/auth/login');

    const disabledLogs = [];
    const disabledRes = createMockResponse();
    const disabledMiddleware = createRequestLoggingMiddleware({
        enabled: false,
        logger: { info: () => disabledLogs.push('logged') }
    });
    disabledMiddleware({ headers: {} }, disabledRes, () => {});
    disabledRes.emit('finish');
    assert.deepEqual(disabledLogs, []);
});

test('request path and id helpers are defensive', () => {
    assert.equal(getRequestPath({ originalUrl: '/play?token=secret' }), '/play');
    assert.equal(getRequestPath({}), '/');
    assert.equal(resolveRequestId({ headers: { 'x-request-id': ['first', 'second'] } }), 'first');
    assert.match(resolveRequestId({ headers: {} }), /^[0-9a-f-]{36}$/i);
});
