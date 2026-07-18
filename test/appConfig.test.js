const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    createAppConfig,
    parseBoolean,
    normalizeSameSite,
    normalizeAllowedOrigin,
    normalizeLogLevel,
    normalizeDatabaseProvider
} = require('../server/config/appConfig');

test('app config provides safe development defaults', () => {
    const projectRoot = path.join('/tmp', 'f1guesserduel');
    const config = createAppConfig({}, { projectRoot });

    assert.equal(config.nodeEnv, 'development');
    assert.equal(config.port, 3000);
    assert.equal(config.dataDir, path.join(projectRoot, 'data'));
    assert.equal(config.persistence.mode, 'local');
    assert.equal(config.persistence.isEphemeral, false);
    assert.deepEqual(config.database, {
        provider: 'sqlite',
        url: null,
        postgresSsl: true
    });
    assert.equal(config.dbFilePath, path.join(projectRoot, 'data', 'f1guesser.sqlite'));
    assert.equal(config.auth.cookie.secure, false);
    assert.equal(config.auth.cookie.sameSite, 'lax');
    assert.equal(config.auth.sessionCookieName, 'f1_session');
    assert.deepEqual(config.socket.allowedOrigins, [
        'http://localhost:3000',
        'https://localhost:3000',
        'http://127.0.0.1:3000',
        'https://127.0.0.1:3000',
        'http://[::1]:3000',
        'https://[::1]:3000'
    ]);
    assert.deepEqual(config.socket.rateLimit, {
        enabled: true,
        windowMs: 60_000
    });
    assert.deepEqual(config.logging, {
        level: 'debug',
        requestLoggingEnabled: false
    });
});

test('app config reads production values from environment', () => {
    const projectRoot = path.join('/tmp', 'f1guesserduel');
    const config = createAppConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        DATA_DIR: '/var/lib/f1guesser',
        PERSISTENCE_MODE: 'persistent',
        DATABASE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://example.com/f1',
        POSTGRES_SSL: 'false',
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
        TRUST_PROXY: 'true',
        PUBLIC_ORIGIN: 'https://f1guesserduel.onrender.com/',
        SOCKET_ALLOWED_ORIGINS: 'https://preview.example.com, http://localhost:5173',
        SOCKET_RATE_LIMIT_ENABLED: 'false',
        SOCKET_RATE_LIMIT_WINDOW_MS: '30000',
        LOG_LEVEL: 'warn',
        REQUEST_LOGGING_ENABLED: 'true'
    }, { projectRoot });

    assert.equal(config.isProduction, true);
    assert.equal(config.port, 8080);
    assert.equal(config.dataDir, '/var/lib/f1guesser');
    assert.equal(config.persistence.mode, 'persistent');
    assert.equal(config.persistence.isEphemeral, false);
    assert.deepEqual(config.database, {
        provider: 'postgres',
        url: 'postgresql://example.com/f1',
        postgresSsl: false
    });
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
    assert.deepEqual(config.socket.allowedOrigins, [
        'https://preview.example.com',
        'http://localhost:5173',
        'https://f1guesserduel.onrender.com'
    ]);
    assert.deepEqual(config.socket.rateLimit, {
        enabled: false,
        windowMs: 30_000
    });
    assert.deepEqual(config.logging, {
        level: 'warn',
        requestLoggingEnabled: true
    });
});

test('production config requires SESSION_SECRET', () => {
    assert.throws(() => createAppConfig({ NODE_ENV: 'production' }), /SESSION_SECRET must be set/);
});

test('boolean and sameSite parsing are defensive', () => {
    assert.equal(parseBoolean('yes'), true);
    assert.equal(parseBoolean('off', true), false);
    assert.equal(parseBoolean('unexpected', true), true);
    assert.equal(normalizeSameSite('None'), 'none');
    assert.equal(normalizeDatabaseProvider('POSTGRES'), 'postgres');
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
    assert.throws(
        () => createAppConfig({ SOCKET_RATE_LIMIT_WINDOW_MS: 'fast' }),
        /SOCKET_RATE_LIMIT_WINDOW_MS must be an integer/
    );
});

test('app config resolves explicit and inferred persistence modes', () => {
    const projectRoot = path.join('/tmp', 'f1guesserduel');

    const explicitEphemeral = createAppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        DATA_DIR: '/tmp/f1guesserduel',
        PERSISTENCE_MODE: 'ephemeral',
        DATABASE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://example.com/f1'
    }, { projectRoot });
    assert.equal(explicitEphemeral.persistence.mode, 'ephemeral');
    assert.equal(explicitEphemeral.persistence.isEphemeral, true);

    const inferredEphemeral = createAppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        DATA_DIR: '/tmp/f1guesserduel',
        DATABASE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://example.com/f1'
    }, { projectRoot });
    assert.equal(inferredEphemeral.persistence.mode, 'ephemeral');

    const inferredPersistent = createAppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        DATA_DIR: '/var/data'
    }, { projectRoot });
    assert.equal(inferredPersistent.persistence.mode, 'persistent');
});

test('production config rejects SQLite on ephemeral storage', () => {
    const baseEnvironment = {
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        DATA_DIR: '/tmp/f1guesserduel'
    };

    assert.throws(
        () => createAppConfig({
            ...baseEnvironment,
            PERSISTENCE_MODE: 'ephemeral'
        }),
        /SQLite cannot store accounts or sessions on ephemeral storage/
    );

    assert.throws(
        () => createAppConfig({
            ...baseEnvironment,
            PERSISTENCE_MODE: 'persistent'
        }),
        /SQLite cannot store accounts or sessions on ephemeral storage/
    );

    const persistentSqlite = createAppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        DATA_DIR: '/var/data',
        PERSISTENCE_MODE: 'persistent',
        DATABASE_PROVIDER: 'sqlite'
    });

    assert.equal(persistentSqlite.database.provider, 'sqlite');
    assert.equal(persistentSqlite.persistence.isEphemeral, false);
});

test('app config rejects invalid boolean and enum values', () => {
    assert.throws(
        () => createAppConfig({ COOKIE_SECURE: 'maybe' }),
        /COOKIE_SECURE must be one of/
    );
    assert.throws(
        () => createAppConfig({ SOCKET_RATE_LIMIT_ENABLED: 'maybe' }),
        /SOCKET_RATE_LIMIT_ENABLED must be one of/
    );
    assert.throws(
        () => createAppConfig({ COOKIE_SAMESITE: 'external' }),
        /COOKIE_SAMESITE must be one of/
    );
    assert.throws(
        () => createAppConfig({ NODE_ENV: 'prod' }),
        /NODE_ENV must be one of/
    );
    assert.throws(
        () => createAppConfig({ PERSISTENCE_MODE: 'temporary' }),
        /PERSISTENCE_MODE must be one of/
    );
    assert.throws(
        () => createAppConfig({ DATABASE_PROVIDER: 'mysql' }),
        /DATABASE_PROVIDER must be one of/
    );
    assert.throws(
        () => createAppConfig({ DATABASE_PROVIDER: 'postgres' }),
        /DATABASE_URL must be set/
    );
    assert.throws(
        () => createAppConfig({ LOG_LEVEL: 'verbose' }),
        /LOG_LEVEL must be one of/
    );
    assert.throws(
        () => createAppConfig({ REQUEST_LOGGING_ENABLED: 'maybe' }),
        /REQUEST_LOGGING_ENABLED must be one of/
    );
    assert.throws(
        () => createAppConfig({ DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://example.com/f1', POSTGRES_SSL: 'maybe' }),
        /POSTGRES_SSL must be one of/
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


test('app config validates socket origin environment values', () => {
    assert.equal(normalizeAllowedOrigin('https://example.com/'), 'https://example.com');
    assert.equal(normalizeAllowedOrigin('http://localhost:3000'), 'http://localhost:3000');

    assert.throws(
        () => createAppConfig({ SOCKET_ALLOWED_ORIGINS: 'ftp://example.com' }),
        /Use http or https/
    );
    assert.throws(
        () => createAppConfig({ PUBLIC_ORIGIN: 'https://example.com/path' }),
        /Use only protocol, host and optional port/
    );
    assert.throws(
        () => createAppConfig({ SOCKET_ALLOWED_ORIGINS: 'https://example.com?x=1' }),
        /Use only protocol, host and optional port/
    );
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


test('logging config defaults to info request logging in production', () => {
    const config = createAppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'session-secret',
        PUBLIC_ORIGIN: 'https://f1guesserduel.onrender.com'
    });

    assert.deepEqual(config.logging, {
        level: 'info',
        requestLoggingEnabled: true
    });
    assert.equal(normalizeLogLevel('ERROR'), 'error');
});
