'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DAY_MS,
    calculateAdminAuditCutoff,
    createAdminAuditCleanupService
} = require('../server/admin/adminAuditCleanupService');

test('admin audit retention cutoff keeps the configured number of days', () => {
    const now = Date.parse('2026-07-26T12:00:00.000Z');
    assert.equal(
        calculateAdminAuditCutoff(now, 180).toISOString(),
        new Date(now - (180 * DAY_MS)).toISOString()
    );
});

test('admin audit cleanup forwards bounded settings and reports cleanup metadata', async () => {
    const calls = [];
    const logs = [];
    let currentTime = Date.parse('2026-07-26T12:00:00.000Z');
    const service = createAdminAuditCleanupService({
        databaseOrRepository: {
            async deleteExpiredAuditEntries(options) {
                calls.push(options);
                currentTime += 25;
                return { lockAcquired: true, deletedCount: 320, batchCount: 2, hasMore: false };
            }
        },
        retentionDays: 180,
        cleanupIntervalMs: 86_400_000,
        batchSize: 250,
        maxBatches: 20,
        clock: () => currentTime,
        logger: { info(message, details) { logs.push({ message, details }); } }
    });

    const result = await service.runCleanup();
    assert.equal(calls[0].cutoff.toISOString(), '2026-01-27T12:00:00.000Z');
    assert.equal(calls[0].batchSize, 250);
    assert.equal(calls[0].maxBatches, 20);
    assert.equal(result.deletedCount, 320);
    assert.equal(result.durationMs, 25);
    assert.match(logs[0].message, /Retention cleanup completed/);
});

test('admin audit cleanup does not overlap an active run', async () => {
    let resolveCleanup;
    const pending = new Promise(resolve => { resolveCleanup = resolve; });
    const service = createAdminAuditCleanupService({
        databaseOrRepository: {
            async deleteExpiredAuditEntries() {
                await pending;
                return { lockAcquired: true, deletedCount: 1, batchCount: 1, hasMore: false };
            }
        },
        logger: {}
    });

    const first = service.runCleanup();
    const second = await service.runCleanup();
    assert.deepEqual(second, {
        skipped: true,
        reason: 'already-running',
        deletedCount: 0,
        batchCount: 0,
        hasMore: false
    });
    resolveCleanup();
    await first;
});
