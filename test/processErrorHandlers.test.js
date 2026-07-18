const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
    createProcessErrorHandlers,
    normalizeProcessError,
    registerProcessErrorHandlers
} = require('../server/runtime/processErrorHandlers');

test('process error handler logs uncaught exception and exits after closing server', async () => {
    const logs = [];
    let closed = false;
    let exitCode = null;
    const server = {
        close(callback) {
            closed = true;
            callback();
        }
    };
    const handlers = createProcessErrorHandlers({
        server,
        logger: { error: (message, meta) => logs.push({ message, meta }) },
        exitProcess: code => { exitCode = code; },
        shutdownTimeoutMs: 10
    });

    const error = new Error('boom');
    await handlers.handleUncaughtException(error);

    assert.equal(closed, true);
    assert.equal(exitCode, 1);
    assert.equal(logs[0].message, 'Uncaught exception');
    assert.equal(logs[0].meta.error, error);
});

test('process error handler ignores duplicate fatal events during shutdown', async () => {
    const logs = [];
    let exitCount = 0;
    const handlers = createProcessErrorHandlers({
        logger: { error: (message, meta) => logs.push({ message, meta }) },
        exitProcess: () => { exitCount += 1; }
    });

    const firstShutdown = handlers.handleUnhandledRejection('first');
    const duplicateShutdown = handlers.handleUncaughtException(new Error('second'));
    await Promise.all([firstShutdown, duplicateShutdown]);

    assert.equal(exitCount, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].message, 'Unhandled promise rejection');
});

test('registerProcessErrorHandlers can unregister listeners', () => {
    const processRef = new EventEmitter();
    const unregister = registerProcessErrorHandlers({
        processRef,
        logger: { error() {} },
        exitProcess() {}
    });

    assert.equal(processRef.listenerCount('uncaughtException'), 1);
    assert.equal(processRef.listenerCount('unhandledRejection'), 1);
    assert.equal(processRef.listenerCount('SIGTERM'), 1);
    assert.equal(processRef.listenerCount('SIGINT'), 1);

    unregister();

    assert.equal(processRef.listenerCount('uncaughtException'), 0);
    assert.equal(processRef.listenerCount('unhandledRejection'), 0);
    assert.equal(processRef.listenerCount('SIGTERM'), 0);
    assert.equal(processRef.listenerCount('SIGINT'), 0);
});

test('SIGTERM performs graceful resource cleanup and exits successfully', async () => {
    const events = [];
    const logs = [];
    let exitCode = null;
    const server = {
        close(callback) {
            events.push('server-close');
            callback();
        }
    };
    const handlers = createProcessErrorHandlers({
        server,
        logger: {
            info: (message, meta) => logs.push({ message, meta }),
            error() {}
        },
        beforeShutdown() {
            events.push('before-shutdown');
        },
        async cleanup() {
            events.push('cleanup');
        },
        exitProcess: code => { exitCode = code; },
        shutdownTimeoutMs: 50
    });

    await handlers.handleSigterm();

    assert.deepEqual(events, ['before-shutdown', 'server-close', 'cleanup']);
    assert.equal(exitCode, 0);
    assert.equal(logs[0].message, 'Graceful shutdown started.');
    assert.equal(logs[0].meta.signal, 'SIGTERM');
});

test('graceful shutdown cleanup failures produce a non-zero exit', async () => {
    const errors = [];
    let exitCode = null;
    const handlers = createProcessErrorHandlers({
        logger: { error: (message, meta) => errors.push({ message, meta }) },
        cleanup: async () => {
            throw new Error('cleanup failed');
        },
        exitProcess: code => { exitCode = code; },
        shutdownTimeoutMs: 50
    });

    await handlers.handleSigint();

    assert.equal(exitCode, 1);
    assert.equal(errors[0].message, 'Application resource cleanup failed');
    assert.equal(errors[0].meta.error.message, 'cleanup failed');
});

test('normalizeProcessError converts non-error rejection reasons', () => {
    assert.equal(normalizeProcessError('plain failure').message, 'plain failure');
});
