const {
    DEFAULT_GAME_HISTORY_RETENTION_DAYS,
    DEFAULT_GAME_HISTORY_CLEANUP_INTERVAL_MS,
    DEFAULT_GAME_HISTORY_CLEANUP_BATCH_SIZE
} = require('../config/appConfig');
const {
    createGameHistoryRetentionRepository
} = require('./gameHistoryRetentionRepository');

const DAY_MS = 24 * 60 * 60 * 1000;

function calculateGameHistoryCutoff(now, retentionDays) {
    const currentTime = Number(now);
    const days = Number(retentionDays);
    if (!Number.isFinite(currentTime)) {
        throw new Error('Game history cleanup clock must return a finite timestamp.');
    }
    if (!Number.isSafeInteger(days) || days <= 0) {
        throw new Error('Game history retention days must be a positive integer.');
    }
    return new Date(currentTime - (days * DAY_MS));
}

function createGameHistoryCleanupService({
    databaseOrRepository,
    retentionDays = DEFAULT_GAME_HISTORY_RETENTION_DAYS,
    cleanupIntervalMs = DEFAULT_GAME_HISTORY_CLEANUP_INTERVAL_MS,
    batchSize = DEFAULT_GAME_HISTORY_CLEANUP_BATCH_SIZE,
    logger = console,
    clock = Date.now,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
} = {}) {
    const repository = createGameHistoryRetentionRepository(databaseOrRepository);
    const effectiveRetentionDays = Number.isSafeInteger(Number(retentionDays)) && Number(retentionDays) > 0
        ? Number(retentionDays)
        : DEFAULT_GAME_HISTORY_RETENTION_DAYS;
    const effectiveCleanupIntervalMs = Number.isFinite(Number(cleanupIntervalMs)) && Number(cleanupIntervalMs) >= 0
        ? Number(cleanupIntervalMs)
        : DEFAULT_GAME_HISTORY_CLEANUP_INTERVAL_MS;
    const effectiveBatchSize = Number.isSafeInteger(Number(batchSize)) && Number(batchSize) > 0
        ? Number(batchSize)
        : DEFAULT_GAME_HISTORY_CLEANUP_BATCH_SIZE;

    let cleanupTimer = null;
    let activeCleanupPromise = null;

    async function runCleanup() {
        if (activeCleanupPromise) {
            return { skipped: true, reason: 'already-running', deletedCount: 0, batchCount: 0 };
        }

        const startedAt = clock();
        const cutoff = calculateGameHistoryCutoff(startedAt, effectiveRetentionDays);
        activeCleanupPromise = Promise.resolve(repository.deleteExpiredGameResults({
            cutoff,
            batchSize: effectiveBatchSize
        })).then(result => {
            const durationMs = Math.max(0, Number(clock()) - Number(startedAt));
            const normalizedResult = {
                skipped: result?.lockAcquired === false,
                reason: result?.lockAcquired === false ? 'lock-not-acquired' : null,
                deletedCount: Math.max(0, Number(result?.deletedCount) || 0),
                batchCount: Math.max(0, Number(result?.batchCount) || 0),
                cutoff: cutoff.toISOString(),
                durationMs
            };

            if (normalizedResult.skipped) {
                logger?.debug?.('[history] Retention cleanup skipped because another instance owns the lock.', {
                    cutoff: normalizedResult.cutoff,
                    retentionDays: effectiveRetentionDays
                });
            } else {
                logger?.info?.('[history] Retention cleanup completed.', {
                    deletedCount: normalizedResult.deletedCount,
                    batchCount: normalizedResult.batchCount,
                    batchSize: effectiveBatchSize,
                    cutoff: normalizedResult.cutoff,
                    retentionDays: effectiveRetentionDays,
                    durationMs
                });
            }

            return normalizedResult;
        }).finally(() => {
            activeCleanupPromise = null;
        });

        return activeCleanupPromise;
    }

    async function runCleanupSafely() {
        try {
            return await runCleanup();
        } catch (error) {
            logger?.error?.('[history] Retention cleanup failed.', {
                error,
                retentionDays: effectiveRetentionDays,
                batchSize: effectiveBatchSize
            });
            return { skipped: true, reason: 'error', deletedCount: 0, batchCount: 0, error };
        }
    }

    function stopScheduling() {
        if (!cleanupTimer) return;
        clearIntervalFn(cleanupTimer);
        cleanupTimer = null;
    }

    async function stop() {
        stopScheduling();
        if (activeCleanupPromise) await activeCleanupPromise.catch(() => null);
    }

    function start({ runImmediately = false } = {}) {
        if (cleanupTimer || effectiveCleanupIntervalMs <= 0) return stop;
        cleanupTimer = setIntervalFn(runCleanupSafely, effectiveCleanupIntervalMs);
        cleanupTimer?.unref?.();
        if (runImmediately) void runCleanupSafely();
        return stop;
    }

    return {
        retentionDays: effectiveRetentionDays,
        cleanupIntervalMs: effectiveCleanupIntervalMs,
        batchSize: effectiveBatchSize,
        runCleanup,
        runCleanupSafely,
        start,
        stop,
        stopScheduling
    };
}

module.exports = {
    DAY_MS,
    calculateGameHistoryCutoff,
    createGameHistoryCleanupService
};
