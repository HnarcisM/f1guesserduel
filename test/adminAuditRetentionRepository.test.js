'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS,
    createPostgresAdminAuditRetentionRepository,
    createSqliteAdminAuditRetentionRepository,
    formatSqliteAuditTimestamp
} = require('../server/admin/adminAuditRetentionRepository');

test('Postgres admin audit cleanup uses a distributed lock and bounded batches', async () => {
    const calls = [];
    const deleteCounts = [250, 250, 12];
    const client = {
        async query(sql, params = []) {
            calls.push({ sql: sql.trim(), params });
            if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
            if (sql.includes('DELETE FROM admin_audit_log')) return { rowCount: deleteCounts.shift() ?? 0, rows: [] };
            if (sql.includes('pg_advisory_unlock')) return { rows: [{ released: true }] };
            return { rows: [] };
        },
        release() {}
    };
    const repository = createPostgresAdminAuditRetentionRepository({
        provider: 'postgres',
        pool: { async connect() { return client; } }
    });

    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    const result = await repository.deleteExpiredAuditEntries({ cutoff, batchSize: 250, maxBatches: 20 });

    assert.deepEqual(result, { lockAcquired: true, deletedCount: 512, batchCount: 3, hasMore: false });
    assert.deepEqual(calls[0].params, POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS);
    const deletes = calls.filter(call => call.sql.includes('DELETE FROM admin_audit_log'));
    assert.equal(deletes.length, 3);
    assert.deepEqual(deletes[0].params, [cutoff, 250]);
    assert.match(deletes[0].sql, /ORDER BY created_at ASC, id ASC/);
    assert.match(calls.at(-1).sql, /pg_advisory_unlock/);
});

test('Postgres admin audit cleanup stops when the per-run batch cap is reached', async () => {
    const client = {
        async query(sql) {
            if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
            if (sql.includes('DELETE FROM admin_audit_log')) return { rowCount: 10 };
            return { rows: [{ released: true }] };
        },
        release() {}
    };
    const repository = createPostgresAdminAuditRetentionRepository({
        provider: 'postgres',
        pool: { async connect() { return client; } }
    });
    assert.deepEqual(
        await repository.deleteExpiredAuditEntries({ cutoff: new Date(), batchSize: 10, maxBatches: 2 }),
        { lockAcquired: true, deletedCount: 20, batchCount: 2, hasMore: true }
    );
});

test('SQLite admin audit cleanup uses the same cutoff and bounded batch semantics', async () => {
    const calls = [];
    const changes = [3, 1];
    const database = {
        prepare(sql) {
            assert.match(sql, /DELETE FROM admin_audit_log/);
            return {
                run(cutoff, batchSize) {
                    calls.push({ cutoff, batchSize });
                    return { changes: changes.shift() ?? 0 };
                }
            };
        }
    };
    const repository = createSqliteAdminAuditRetentionRepository(database);
    const cutoff = new Date('2026-01-01T01:02:03.000Z');
    const result = await repository.deleteExpiredAuditEntries({ cutoff, batchSize: 3, maxBatches: 20 });

    assert.deepEqual(result, { lockAcquired: true, deletedCount: 4, batchCount: 2, hasMore: false });
    assert.deepEqual(calls, [
        { cutoff: '2026-01-01 01:02:03', batchSize: 3 },
        { cutoff: '2026-01-01 01:02:03', batchSize: 3 }
    ]);
    assert.equal(formatSqliteAuditTimestamp(cutoff), '2026-01-01 01:02:03');
});
