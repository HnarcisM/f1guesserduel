const assert = require('node:assert/strict');
const test = require('node:test');

const {
    POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS,
    formatSqliteTimestamp,
    createPostgresGameHistoryRetentionRepository,
    createSqliteGameHistoryRetentionRepository
} = require('../server/account/gameHistoryRetentionRepository');

class FakePostgresClient {
    constructor({ lockAcquired = true, deleteCounts = [], failDelete = null, failUnlock = null } = {}) {
        this.lockAcquired = lockAcquired;
        this.deleteCounts = [...deleteCounts];
        this.failDelete = failDelete;
        this.failUnlock = failUnlock;
        this.queries = [];
        this.releaseCalls = [];
    }

    async query(sql, params = []) {
        const normalizedSql = sql.trim();
        this.queries.push({ sql: normalizedSql, params });
        if (normalizedSql.startsWith('SELECT pg_try_advisory_lock')) {
            return { rows: [{ acquired: this.lockAcquired }] };
        }
        if (normalizedSql.startsWith('WITH expired_results')) {
            if (this.failDelete) throw this.failDelete;
            const rowCount = this.deleteCounts.shift() ?? 0;
            return { rowCount, rows: Array.from({ length: rowCount }, (_, id) => ({ id })) };
        }
        if (normalizedSql.startsWith('SELECT pg_advisory_unlock')) {
            if (this.failUnlock) throw this.failUnlock;
            return { rows: [{ released: true }] };
        }
        throw new Error(`Unexpected SQL: ${normalizedSql}`);
    }

    release(error) {
        this.releaseCalls.push(error || null);
    }
}

function createPostgresDatabase(client) {
    return {
        provider: 'postgres',
        pool: {
            async connect() {
                return client;
            }
        }
    };
}

test('Postgres retention deletes expired history in bounded batches under one advisory lock', async () => {
    const client = new FakePostgresClient({ deleteCounts: [2, 2, 1] });
    const repository = createPostgresGameHistoryRetentionRepository(createPostgresDatabase(client));
    const cutoff = new Date('2025-07-23T12:00:00.000Z');

    const result = await repository.deleteExpiredGameResults({ cutoff, batchSize: 2 });

    assert.deepEqual(result, { lockAcquired: true, deletedCount: 5, batchCount: 3 });
    assert.deepEqual(client.queries[0].params, POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS);
    const deleteQueries = client.queries.filter(query => query.sql.startsWith('WITH expired_results'));
    assert.equal(deleteQueries.length, 3);
    for (const query of deleteQueries) assert.deepEqual(query.params, [cutoff, 2]);
    assert.match(client.queries.at(-1).sql, /pg_advisory_unlock/);
    assert.deepEqual(client.releaseCalls, [null]);
});

test('Postgres retention skips deletion when another instance owns the advisory lock', async () => {
    const client = new FakePostgresClient({ lockAcquired: false, deleteCounts: [1] });
    const repository = createPostgresGameHistoryRetentionRepository(createPostgresDatabase(client));

    const result = await repository.deleteExpiredGameResults({
        cutoff: new Date('2025-07-23T12:00:00.000Z'),
        batchSize: 5000
    });

    assert.deepEqual(result, { lockAcquired: false, deletedCount: 0, batchCount: 0 });
    assert.equal(client.queries.length, 1);
    assert.deepEqual(client.releaseCalls, [null]);
});

test('Postgres retention releases the lock and client when deletion fails', async () => {
    const failure = new Error('delete failed');
    const client = new FakePostgresClient({ failDelete: failure });
    const repository = createPostgresGameHistoryRetentionRepository(createPostgresDatabase(client));

    await assert.rejects(
        repository.deleteExpiredGameResults({
            cutoff: new Date('2025-07-23T12:00:00.000Z'),
            batchSize: 5000
        }),
        /delete failed/
    );

    assert.match(client.queries.at(-1).sql, /pg_advisory_unlock/);
    assert.deepEqual(client.releaseCalls, [null]);
});

test('Postgres retention discards a client when advisory unlock fails', async () => {
    const unlockFailure = new Error('unlock failed');
    const client = new FakePostgresClient({ deleteCounts: [0], failUnlock: unlockFailure });
    const repository = createPostgresGameHistoryRetentionRepository(createPostgresDatabase(client));

    await assert.rejects(
        repository.deleteExpiredGameResults({
            cutoff: new Date('2025-07-23T12:00:00.000Z'),
            batchSize: 5000
        }),
        /unlock failed/
    );

    assert.deepEqual(client.releaseCalls, [unlockFailure]);
});

test('SQLite retention formats UTC cutoffs and deletes in bounded batches', async () => {
    const calls = [];
    const counts = [3, 2];
    const database = {
        prepare(sql) {
            assert.match(sql, /DELETE FROM user_game_results/);
            return {
                run(cutoff, batchSize) {
                    calls.push({ cutoff, batchSize });
                    return { changes: counts.shift() ?? 0 };
                }
            };
        }
    };
    const repository = createSqliteGameHistoryRetentionRepository(database);

    const result = await repository.deleteExpiredGameResults({
        cutoff: new Date('2025-07-23T12:34:56.789Z'),
        batchSize: 3
    });

    assert.equal(formatSqliteTimestamp('2025-07-23T12:34:56.789Z'), '2025-07-23 12:34:56');
    assert.deepEqual(result, { lockAcquired: true, deletedCount: 5, batchCount: 2 });
    assert.deepEqual(calls, [
        { cutoff: '2025-07-23 12:34:56', batchSize: 3 },
        { cutoff: '2025-07-23 12:34:56', batchSize: 3 }
    ]);
});


test('retention migration and SQLite schema index global cleanup by completion time', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const migration = fs.readFileSync(
        path.join(root, 'server/db/migrations/postgres/008_game_history_retention.sql'),
        'utf8'
    );
    const sqliteSchema = fs.readFileSync(path.join(root, 'server/db/schema.sql'), 'utf8');

    assert.match(migration, /idx_user_game_results_completed_at/);
    assert.match(migration, /ON user_game_results\(completed_at ASC\)/);
    assert.match(sqliteSchema, /idx_user_game_results_completed_at/);
    assert.doesNotMatch(migration, /user_game_stats|user_progress/);
});
