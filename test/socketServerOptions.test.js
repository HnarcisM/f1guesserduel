const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createSocketAllowRequest,
    createSocketOriginChecker,
    createSocketServerOptions,
    isSocketOriginAllowed,
    DEFAULT_SOCKET_PING_INTERVAL_MS,
    DEFAULT_SOCKET_PING_TIMEOUT_MS
} = require('../server/socket/socketServerOptions');

function runOriginChecker(checker, origin) {
    return new Promise(resolve => {
        checker(origin, (error, allowed) => {
            resolve({ error, allowed });
        });
    });
}

function runAllowRequest(allowRequest, origin) {
    return new Promise(resolve => {
        allowRequest({ headers: origin ? { origin } : {} }, (error, allowed) => {
            resolve({ error, allowed });
        });
    });
}

test('socket origin checker allows configured origins and same-origin requests without origin header', async () => {
    const allowedOrigins = ['https://f1guesserduel.onrender.com', 'http://localhost:3000'];
    const checker = createSocketOriginChecker(allowedOrigins);

    assert.deepEqual(await runOriginChecker(checker, 'https://f1guesserduel.onrender.com'), {
        error: null,
        allowed: true
    });
    assert.deepEqual(await runOriginChecker(checker, undefined), {
        error: null,
        allowed: true
    });
});

test('socket origin checker rejects untrusted origins', async () => {
    const checker = createSocketOriginChecker(['https://f1guesserduel.onrender.com']);
    const result = await runOriginChecker(checker, 'https://evil.example');

    assert.equal(result.allowed, false);
    assert.match(result.error.message, /origin is not allowed/);
});

test('socket allowRequest applies the same origin restriction for websocket upgrades', async () => {
    const allowRequest = createSocketAllowRequest(['https://f1guesserduel.onrender.com']);

    assert.deepEqual(await runAllowRequest(allowRequest, 'https://f1guesserduel.onrender.com'), {
        error: null,
        allowed: true
    });

    const blocked = await runAllowRequest(allowRequest, 'https://evil.example');
    assert.equal(blocked.allowed, false);
    assert.match(blocked.error, /origin is not allowed/);
});

test('socket server options keep ping settings and credentials-aware CORS', () => {
    const options = createSocketServerOptions({
        allowedOrigins: ['https://f1guesserduel.onrender.com']
    });

    assert.equal(options.pingInterval, DEFAULT_SOCKET_PING_INTERVAL_MS);
    assert.equal(options.pingTimeout, DEFAULT_SOCKET_PING_TIMEOUT_MS);
    assert.equal(options.cors.credentials, true);
    assert.deepEqual(options.cors.methods, ['GET', 'POST']);
    assert.equal(typeof options.cors.origin, 'function');
    assert.equal(typeof options.allowRequest, 'function');
});

test('socket origin helper is strict by exact origin', () => {
    const allowedOrigins = ['https://f1guesserduel.onrender.com'];

    assert.equal(isSocketOriginAllowed('https://f1guesserduel.onrender.com', allowedOrigins), true);
    assert.equal(isSocketOriginAllowed('https://f1guesserduel.onrender.com.evil.example', allowedOrigins), false);
    assert.equal(isSocketOriginAllowed('http://f1guesserduel.onrender.com', allowedOrigins), false);
    assert.equal(isSocketOriginAllowed(undefined, allowedOrigins), true);
});
