const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createLogger,
    normalizeLogLevel,
    sanitizeLogMeta,
    serializeError
} = require('../server/logger');

test('logger writes structured JSON in production and redacts sensitive metadata', () => {
    const output = [];
    const logger = createLogger({
        isProduction: true,
        level: 'info',
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        destination: { log: message => output.push(message) }
    });

    logger.info('login attempt', {
        username: 'narcis',
        password: 'secret-password',
        nested: {
            socketAuthToken: 'token-value'
        }
    });

    assert.equal(output.length, 1);
    const payload = JSON.parse(output[0]);
    assert.equal(payload.time, '2026-07-01T12:00:00.000Z');
    assert.equal(payload.level, 'info');
    assert.equal(payload.message, 'login attempt');
    assert.equal(payload.username, 'narcis');
    assert.equal(payload.password, '[REDACTED]');
    assert.equal(payload.nested.socketAuthToken, '[REDACTED]');
});

test('logger respects log levels', () => {
    const output = [];
    const logger = createLogger({
        isProduction: true,
        level: 'warn',
        destination: {
            log: message => output.push(message),
            warn: message => output.push(message)
        }
    });

    logger.info('ignored');
    logger.warn('kept');

    assert.equal(output.length, 1);
    assert.equal(JSON.parse(output[0]).message, 'kept');
});

test('logger serializes errors without leaking token-like fields', () => {
    const error = new Error('Database failed');
    error.code = 'SQLITE_BUSY';
    const meta = sanitizeLogMeta({
        error,
        headers: {
            authorization: 'Bearer secret',
            cookie: 'f1_session=value'
        }
    });

    assert.equal(meta.error.name, 'Error');
    assert.equal(meta.error.message, 'Database failed');
    assert.equal(meta.error.code, 'SQLITE_BUSY');
    assert.equal(meta.headers.authorization, '[REDACTED]');
    assert.equal(meta.headers.cookie, '[REDACTED]');
});

test('normalizeLogLevel validates supported levels with fallback', () => {
    assert.equal(normalizeLogLevel('DEBUG'), 'debug');
    assert.equal(normalizeLogLevel('invalid', 'error'), 'error');
    assert.equal(serializeError('boom').message, 'boom');
});
