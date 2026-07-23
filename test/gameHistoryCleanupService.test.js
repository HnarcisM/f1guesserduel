const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DAY_MS,
    calculateGameHistoryCutoff,
    createGameHistoryCleanupService
} = require('../server/account/gameHistoryCleanupService');

function createLogger() {
    const entries = [];
    return {
        entries,
        info(message, metadata) {
            entries.push({ level: 'info', message, metadata });
        },
        debug(message, metadata) {
            entries.push({ level: 'debug', message, metadata });
        },
        error(message, metadata) {
            entries.push({ level: 'error', message, metadata });
        }
    };
}

test('retention cutoff subtracts full UTC days from the cleanup clock', () => {
    const now = Date.parse('2026-07-23T10:15:30.000Z');
    assert.equal(
        calculateGameHistoryCutoff(now, 365).toISOString(),
        new Date(now - (365 * DAY_MS)).toISOString()
    );
});

test('cleanup service deletes expired rows with configured policy and logs the result', async () => {
    const logger = createLogger();
    const calls = [];
    const timestamps = [Date.parse('2026-07-23T10:00:00.000Z'), Date.parse('2026-07-23T10:00:00.125Z')];
    const service = createGameHistoryCleanupService({
        databaseOrRepository: {
            async deleteExpiredGameResults(options) {
                calls.push(options);
                return { lockAcquired: true, deletedCount: 12, batchCount: 3 };
            }
        },
        retentionDays: 365,
        cleanupIntervalMs: 604_800_000,
        batchSize: 5,
        logger,
        clock: () => timestamps.shift()
    });

    const result = await service.runCleanup();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].batchSize, 5);
    assert.equal(calls[0].cutoff.toISOString(), '2025-07-23T10:00:00.000Z');
    assert.deepEqual(result, {
        skipped: false,
        reason: null,
        deletedCount: 12,
        batchCount: 3,
        cutoff: '2025-07-23T10:00:00.000Z',
        durationMs: 125
    });
    assert.equal(logger.entries[0].level, 'info');
    assert.equal(logger.entries[0].metadata.deletedCount, 12);
});

test('cleanup service skips concurrent local runs and remote lock contention', async () => {
    let resolveCleanup;
    const pending = new Promise(resolve => {
        resolveCleanup = resolve;
    });
    const service = createGameHistoryCleanupService({
        databaseOrRepository: {
            deleteExpiredGameResults() {
                return pending;
            }
        },
        logger: createLogger(),
        clock: () => Date.parse('2026-07-23T10:00:00.000Z')
    });

    const first = service.runCleanup();
    const second = await service.runCleanup();
    assert.deepEqual(second, {
        skipped: true,
        reason: 'already-running',
        deletedCount: 0,
        batchCount: 0
    });
    resolveCleanup({ lockAcquired: false, deletedCount: 0, batchCount: 0 });
    const firstResult = await first;
    assert.equal(firstResult.skipped, true);
    assert.equal(firstResult.reason, 'lock-not-acquired');
});

test('cleanup service catches repository failures and logs them without crashing the interval', async () => {
    const logger = createLogger();
    const service = createGameHistoryCleanupService({
        databaseOrRepository: {
            async deleteExpiredGameResults() {
                throw new Error('database unavailable');
            }
        },
        logger,
        clock: () => Date.parse('2026-07-23T10:00:00.000Z')
    });

    const result = await service.runCleanupSafely();

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'error');
    assert.match(result.error.message, /database unavailable/);
    assert.equal(logger.entries[0].level, 'error');
});

test('cleanup scheduler is disableable, unrefs its timer and stops cleanly', async () => {
    const scheduled = [];
    const cleared = [];
    const timer = { unrefCalls: 0, unref() { this.unrefCalls += 1; } };
    let cleanupCalls = 0;
    const service = createGameHistoryCleanupService({
        databaseOrRepository: {
            async deleteExpiredGameResults() {
                cleanupCalls += 1;
                return { lockAcquired: true, deletedCount: 0, batchCount: 0 };
            }
        },
        cleanupIntervalMs: 1234,
        logger: createLogger(),
        setIntervalFn(callback, delay) {
            scheduled.push({ callback, delay });
            return timer;
        },
        clearIntervalFn(value) {
            cleared.push(value);
        }
    });

    service.start({ runImmediately: true });
    assert.equal(scheduled[0].delay, 1234);
    assert.equal(timer.unrefCalls, 1);
    await service.stop();
    assert.equal(cleanupCalls, 1);
    assert.deepEqual(cleared, [timer]);

    const disabledSchedules = [];
    const disabled = createGameHistoryCleanupService({
        databaseOrRepository: {
            async deleteExpiredGameResults() {
                return { lockAcquired: true, deletedCount: 0, batchCount: 0 };
            }
        },
        cleanupIntervalMs: 0,
        logger: createLogger(),
        setIntervalFn(...args) {
            disabledSchedules.push(args);
        }
    });
    disabled.start();
    assert.equal(disabledSchedules.length, 0);
});

test('cleanup shutdown waits for an active retention run before database close', async () => {
    let resolveCleanup;
    const activeCleanup = new Promise(resolve => {
        resolveCleanup = resolve;
    });
    const service = createGameHistoryCleanupService({
        databaseOrRepository: {
            deleteExpiredGameResults() {
                return activeCleanup;
            }
        },
        cleanupIntervalMs: 1000,
        logger: createLogger(),
        setIntervalFn() {
            return { unref() {} };
        },
        clearIntervalFn() {}
    });

    service.start({ runImmediately: true });
    let stopped = false;
    const stopPromise = service.stop().then(() => {
        stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);

    resolveCleanup({ lockAcquired: true, deletedCount: 0, batchCount: 0 });
    await stopPromise;
    assert.equal(stopped, true);
});
