const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
    createProcessErrorHandlers,
    normalizeProcessError,
    registerProcessErrorHandlers
} = require('../server/runtime/processErrorHandlers');

test('process error handler logs uncaught exception and exits after closing server', () => {
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
    handlers.handleUncaughtException(error);

    assert.equal(closed, true);
    assert.equal(exitCode, 1);
    assert.equal(logs[0].message, 'Uncaught exception');
    assert.equal(logs[0].meta.error, error);
});

test('process error handler ignores duplicate fatal events during shutdown', () => {
    const logs = [];
    let exitCount = 0;
    const handlers = createProcessErrorHandlers({
        logger: { error: (message, meta) => logs.push({ message, meta }) },
        exitProcess: () => { exitCount += 1; }
    });

    handlers.handleUnhandledRejection('first');
    handlers.handleUncaughtException(new Error('second'));

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

    unregister();

    assert.equal(processRef.listenerCount('uncaughtException'), 0);
    assert.equal(processRef.listenerCount('unhandledRejection'), 0);
});

test('normalizeProcessError converts non-error rejection reasons', () => {
    assert.equal(normalizeProcessError('plain failure').message, 'plain failure');
});
