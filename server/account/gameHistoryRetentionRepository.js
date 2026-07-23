const POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS = Object.freeze([1177633107, 1381259348]);

const POSTGRES_TRY_CLEANUP_LOCK_SQL = `
    SELECT pg_try_advisory_lock($1, $2) AS acquired
`;

const POSTGRES_RELEASE_CLEANUP_LOCK_SQL = `
    SELECT pg_advisory_unlock($1, $2) AS released
`;

const POSTGRES_DELETE_EXPIRED_GAME_RESULTS_SQL = `
    WITH expired_results AS (
        SELECT id
        FROM user_game_results
        WHERE completed_at < $1
        ORDER BY completed_at ASC, id ASC
        LIMIT $2
    )
    DELETE FROM user_game_results AS results
    USING expired_results
    WHERE results.id = expired_results.id
`;

const SQLITE_DELETE_EXPIRED_GAME_RESULTS_SQL = `
    DELETE FROM user_game_results
    WHERE id IN (
        SELECT id
        FROM user_game_results
        WHERE completed_at < ?
        ORDER BY completed_at ASC, id ASC
        LIMIT ?
    )
`;

function normalizeBatchSize(value) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('Game history cleanup batch size must be a positive integer.');
    }
    return parsed;
}

function normalizeCutoff(value) {
    const cutoff = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(cutoff.getTime())) {
        throw new Error('Game history cleanup cutoff must be a valid date.');
    }
    return cutoff;
}

function formatSqliteTimestamp(value) {
    return normalizeCutoff(value)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '');
}

function createPostgresGameHistoryRetentionRepository(database) {
    if (!database?.pool || typeof database.pool.connect !== 'function') {
        throw new Error('Postgres game history retention requires a connection pool.');
    }

    async function deleteExpiredGameResults({ cutoff, batchSize }) {
        const normalizedCutoff = normalizeCutoff(cutoff);
        const normalizedBatchSize = normalizeBatchSize(batchSize);
        const client = await database.pool.connect();
        let lockAcquired = false;
        let deletedCount = 0;
        let batchCount = 0;
        let cleanupError = null;

        try {
            const lockResult = await client.query(
                POSTGRES_TRY_CLEANUP_LOCK_SQL,
                POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS
            );
            lockAcquired = lockResult.rows?.[0]?.acquired === true;
            if (!lockAcquired) {
                return { lockAcquired: false, deletedCount: 0, batchCount: 0 };
            }

            while (true) {
                const deleteResult = await client.query(
                    POSTGRES_DELETE_EXPIRED_GAME_RESULTS_SQL,
                    [normalizedCutoff, normalizedBatchSize]
                );
                const deletedInBatch = Number(deleteResult.rowCount) || 0;
                deletedCount += deletedInBatch;
                batchCount += deletedInBatch > 0 ? 1 : 0;
                if (deletedInBatch < normalizedBatchSize) break;
            }

            return { lockAcquired: true, deletedCount, batchCount };
        } catch (error) {
            cleanupError = error;
            throw error;
        } finally {
            let unlockError = null;
            if (lockAcquired) {
                try {
                    await client.query(
                        POSTGRES_RELEASE_CLEANUP_LOCK_SQL,
                        POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS
                    );
                } catch (error) {
                    unlockError = error;
                }
            }
            client.release(unlockError || undefined);
            if (unlockError && !cleanupError) throw unlockError;
        }
    }

    return {
        provider: 'postgres',
        deleteExpiredGameResults
    };
}

function createSqliteGameHistoryRetentionRepository(database) {
    if (typeof database?.prepare !== 'function') {
        throw new Error('SQLite game history retention requires a database connection.');
    }

    const deleteExpiredBatch = database.prepare(SQLITE_DELETE_EXPIRED_GAME_RESULTS_SQL);

    async function deleteExpiredGameResults({ cutoff, batchSize }) {
        const normalizedBatchSize = normalizeBatchSize(batchSize);
        const sqliteCutoff = formatSqliteTimestamp(cutoff);
        let deletedCount = 0;
        let batchCount = 0;

        while (true) {
            const result = deleteExpiredBatch.run(sqliteCutoff, normalizedBatchSize);
            const deletedInBatch = Number(result.changes) || 0;
            deletedCount += deletedInBatch;
            batchCount += deletedInBatch > 0 ? 1 : 0;
            if (deletedInBatch < normalizedBatchSize) break;
        }

        return { lockAcquired: true, deletedCount, batchCount };
    }

    return {
        provider: 'sqlite',
        deleteExpiredGameResults
    };
}

function createGameHistoryRetentionRepository(databaseOrRepository) {
    if (typeof databaseOrRepository?.deleteExpiredGameResults === 'function') {
        return databaseOrRepository;
    }
    if (databaseOrRepository?.provider === 'postgres' || databaseOrRepository?.pool) {
        return createPostgresGameHistoryRetentionRepository(databaseOrRepository);
    }
    if (typeof databaseOrRepository?.prepare === 'function') {
        return createSqliteGameHistoryRetentionRepository(databaseOrRepository);
    }
    throw new Error('Unsupported database adapter for game history retention.');
}

module.exports = {
    POSTGRES_GAME_HISTORY_CLEANUP_LOCK_KEYS,
    POSTGRES_TRY_CLEANUP_LOCK_SQL,
    POSTGRES_RELEASE_CLEANUP_LOCK_SQL,
    POSTGRES_DELETE_EXPIRED_GAME_RESULTS_SQL,
    SQLITE_DELETE_EXPIRED_GAME_RESULTS_SQL,
    normalizeBatchSize,
    normalizeCutoff,
    formatSqliteTimestamp,
    createGameHistoryRetentionRepository,
    createPostgresGameHistoryRetentionRepository,
    createSqliteGameHistoryRetentionRepository
};
