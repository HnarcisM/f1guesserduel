const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    createAppConfig,
    parseBoolean,
    normalizeSameSite
} = require('../server/config/appConfig');

test('app config provides safe development defaults', () => {
    const projectRoot = path.join('/tmp', 'f1guesserduel');
    const config = createAppConfig({}, { projectRoot });

    assert.equal(config.nodeEnv, 'development');
    assert.equal(config.port, 3000);
    assert.equal(config.dataDir, path.join(projectRoot, 'data'));
    assert.equal(config.dbFilePath, path.join(projectRoot, 'data', 'f1guesser.sqlite'));
    assert.equal(config.auth.cookie.secure, false);
    assert.equal(config.auth.cookie.sameSite, 'lax');
    assert.equal(config.auth.sessionCookieName, 'f1_session');
});

test('app config reads production values from environment', () => {
    const projectRoot = path.join('/tmp', 'f1guesserduel');
    const config = createAppConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        DATA_DIR: '/var/lib/f1guesser',
        SESSION_SECRET: 'session-secret',
        SOCKET_AUTH_SECRET: 'socket-secret',
        COOKIE_SECURE: 'false',
        COOKIE_SAMESITE: 'strict',
        SESSION_COOKIE_NAME: 'custom_session',
        SESSION_MAX_AGE_DAYS: '14',
        SOCKET_AUTH_TOKEN_MAX_AGE_MS: '60000',
        SESSION_CLEANUP_INTERVAL_MS: '120000',
        ROOMS_FILE_PATH: '/var/lib/f1guesser/rooms.json',
        ROOM_SAVE_DEBOUNCE_MS: '500',
        TRUST_PROXY: 'true'
    }, { projectRoot });

    assert.equal(config.isProduction, true);
    assert.equal(config.port, 8080);
    assert.equal(config.dataDir, '/var/lib/f1guesser');
    assert.equal(path.normalize(config.dbFilePath), path.normalize('/var/lib/f1guesser/f1guesser.sqlite'));
    assert.equal(config.trustProxy, true);
    assert.equal(config.auth.sessionSecret, 'session-secret');
    assert.equal(config.auth.socketAuthSecret, 'socket-secret');
    assert.equal(config.auth.cookie.secure, false);
    assert.equal(config.auth.cookie.sameSite, 'strict');
    assert.equal(config.auth.sessionCookieName, 'custom_session');
    assert.equal(config.auth.sessionMaxAgeMs, 14 * 24 * 60 * 60 * 1000);
    assert.equal(config.auth.socketAuthTokenMaxAgeMs, 60000);
    assert.equal(config.auth.sessionCleanupIntervalMs, 120000);
    assert.equal(path.normalize(config.rooms.persistenceFilePath), path.normalize('/var/lib/f1guesser/rooms.json'));
    assert.equal(config.rooms.saveDebounceMs, 500);
});

test('production config requires SESSION_SECRET', () => {
    assert.throws(() => createAppConfig({ NODE_ENV: 'production' }), /SESSION_SECRET must be set/);
});

test('boolean and sameSite parsing are defensive', () => {
    assert.equal(parseBoolean('yes'), true);
    assert.equal(parseBoolean('off', true), false);
    assert.equal(parseBoolean('unexpected', true), true);
    assert.equal(normalizeSameSite('None'), 'none');
    assert.equal(normalizeSameSite('invalid'), 'lax');
});

test('app config rejects invalid numeric environment values', () => {
    assert.throws(
        () => createAppConfig({ PORT: '70000' }),
        /PORT must be an integer between 1 and 65535/
    );
    assert.throws(
        () => createAppConfig({ SESSION_MAX_AGE_DAYS: '0' }),
        /SESSION_MAX_AGE_DAYS must be an integer/
    );
    assert.throws(
        () => createAppConfig({ SOCKET_AUTH_TOKEN_MAX_AGE_MS: 'fast' }),
        /SOCKET_AUTH_TOKEN_MAX_AGE_MS must be an integer/
    );
});

test('app config rejects invalid boolean and enum values', () => {
    assert.throws(
        () => createAppConfig({ COOKIE_SECURE: 'maybe' }),
        /COOKIE_SECURE must be one of/
    );
    assert.throws(
        () => createAppConfig({ COOKIE_SAMESITE: 'external' }),
        /COOKIE_SAMESITE must be one of/
    );
    assert.throws(
        () => createAppConfig({ NODE_ENV: 'prod' }),
        /NODE_ENV must be one of/
    );
});

test('app config validates cookie settings', () => {
    assert.throws(
        () => createAppConfig({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' }),
        /COOKIE_SAMESITE=none requires COOKIE_SECURE=true/
    );
    assert.throws(
        () => createAppConfig({ SESSION_COOKIE_NAME: 'bad cookie' }),
        /SESSION_COOKIE_NAME must be a valid cookie name/
    );

    const config = createAppConfig({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' });
    assert.equal(config.auth.cookie.sameSite, 'none');
    assert.equal(config.auth.cookie.secure, true);
});

test('app config rejects empty string environment overrides', () => {
    assert.throws(
        () => createAppConfig({ DATA_DIR: '   ' }),
        /DATA_DIR must not be empty/
    );
    assert.throws(
        () => createAppConfig({ SESSION_SECRET: '   ' }),
        /SESSION_SECRET must not be empty/
    );
});
