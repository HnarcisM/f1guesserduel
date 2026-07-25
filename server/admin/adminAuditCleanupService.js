'use strict';

const {
    DEFAULT_ADMIN_AUDIT_RETENTION_DAYS,
    DEFAULT_ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
    DEFAULT_ADMIN_AUDIT_CLEANUP_BATCH_SIZE,
    DEFAULT_ADMIN_AUDIT_CLEANUP_MAX_BATCHES
} = require('../config/appConfig');
const {
    createAdminAuditRetentionRepository
} = require('./adminAuditRetentionRepository');

const DAY_MS = 24 * 60 * 60 * 1000;

function calculateAdminAuditCutoff(now, retentionDays) {
    const currentTime = Number(now);
    const days = Number(retentionDays);
    if (!Number.isFinite(currentTime)) {
        throw new Error('Admin audit cleanup clock must return a finite timestamp.');
    }
    if (!Number.isSafeInteger(days) || days <= 0) {
        throw new Error('Admin audit retention days must be a positive integer.');
    }
    return new Date(currentTime - (days * DAY_MS));
}

function createAdminAuditCleanupService({
    databaseOrRepository,
    retentionDays = DEFAULT_ADMIN_AUDIT_RETENTION_DAYS,
    cleanupIntervalMs = DEFAULT_ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
    batchSize = DEFAULT_ADMIN_AUDIT_CLEANUP_BATCH_SIZE,
    maxBatches = DEFAULT_ADMIN_AUDIT_CLEANUP_MAX_BATCHES,
    logger = console,
    clock = Date.now,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
} = {}) {
    const repository = createAdminAuditRetentionRepository(databaseOrRepository);
    const effectiveRetentionDays = Number.isSafeInteger(Number(retentionDays)) && Number(retentionDays) > 0
        ? Number(retentionDays)
        : DEFAULT_ADMIN_AUDIT_RETENTION_DAYS;
    const effectiveCleanupIntervalMs = Number.isFinite(Number(cleanupIntervalMs)) && Number(cleanupIntervalMs) >= 0
        ? Number(cleanupIntervalMs)
        : DEFAULT_ADMIN_AUDIT_CLEANUP_INTERVAL_MS;
    const effectiveBatchSize = Number.isSafeInteger(Number(batchSize)) && Number(batchSize) > 0
        ? Number(batchSize)
        : DEFAULT_ADMIN_AUDIT_CLEANUP_BATCH_SIZE;
    const effectiveMaxBatches = Number.isSafeInteger(Number(maxBatches)) && Number(maxBatches) > 0
        ? Number(maxBatches)
        : DEFAULT_ADMIN_AUDIT_CLEANUP_MAX_BATCHES;

    let cleanupTimer = null;
    let activeCleanupPromise = null;

    async function runCleanup() {
        if (activeCleanupPromise) {
            return { skipped: true, reason: 'already-running', deletedCount: 0, batchCount: 0, hasMore: false };
        }

        const startedAt = clock();
        const cutoff = calculateAdminAuditCutoff(startedAt, effectiveRetentionDays);
        activeCleanupPromise = Promise.resolve(repository.deleteExpiredAuditEntries({
            cutoff,
            batchSize: effectiveBatchSize,
            maxBatches: effectiveMaxBatches
        })).then(result => {
            const durationMs = Math.max(0, Number(clock()) - Number(startedAt));
            const normalizedResult = {
                skipped: result?.lockAcquired === false,
                reason: result?.lockAcquired === false ? 'lock-not-acquired' : null,
                deletedCount: Math.max(0, Number(result?.deletedCount) || 0),
                batchCount: Math.max(0, Number(result?.batchCount) || 0),
                hasMore: result?.hasMore === true,
                cutoff: cutoff.toISOString(),
                durationMs
            };

            if (normalizedResult.skipped) {
                logger?.debug?.('[admin-audit] Retention cleanup skipped because another instance owns the lock.', {
                    cutoff: normalizedResult.cutoff,
                    retentionDays: effectiveRetentionDays
                });
            } else {
                logger?.info?.('[admin-audit] Retention cleanup completed.', {
                    deletedCount: normalizedResult.deletedCount,
                    batchCount: normalizedResult.batchCount,
                    batchSize: effectiveBatchSize,
                    maxBatches: effectiveMaxBatches,
                    hasMore: normalizedResult.hasMore,
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
            logger?.error?.('[admin-audit] Retention cleanup failed.', {
                error,
                retentionDays: effectiveRetentionDays,
                batchSize: effectiveBatchSize,
                maxBatches: effectiveMaxBatches
            });
            return {
                skipped: true,
                reason: 'error',
                deletedCount: 0,
                batchCount: 0,
                hasMore: false,
                error
            };
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
        maxBatches: effectiveMaxBatches,
        runCleanup,
        runCleanupSafely,
        start,
        stop,
        stopScheduling
    };
}

module.exports = {
    DAY_MS,
    calculateAdminAuditCutoff,
    createAdminAuditCleanupService
};
