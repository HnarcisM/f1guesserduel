'use strict';

const POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS = Object.freeze([1096111177, 1953654130]);

const POSTGRES_TRY_ADMIN_AUDIT_CLEANUP_LOCK_SQL = `
    SELECT pg_try_advisory_lock($1, $2) AS acquired
`;

const POSTGRES_RELEASE_ADMIN_AUDIT_CLEANUP_LOCK_SQL = `
    SELECT pg_advisory_unlock($1, $2) AS released
`;

const POSTGRES_DELETE_EXPIRED_ADMIN_AUDIT_SQL = `
    WITH expired_audit AS (
        SELECT id
        FROM admin_audit_log
        WHERE created_at < $1
        ORDER BY created_at ASC, id ASC
        LIMIT $2
    )
    DELETE FROM admin_audit_log AS audit
    USING expired_audit
    WHERE audit.id = expired_audit.id
`;

const SQLITE_DELETE_EXPIRED_ADMIN_AUDIT_SQL = `
    DELETE FROM admin_audit_log
    WHERE id IN (
        SELECT id
        FROM admin_audit_log
        WHERE created_at < ?
        ORDER BY datetime(created_at) ASC, id ASC
        LIMIT ?
    )
`;

function normalizePositiveInteger(value, name) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return parsed;
}

function normalizeAuditCutoff(value) {
    const cutoff = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(cutoff.getTime())) {
        throw new Error('Admin audit cleanup cutoff must be a valid date.');
    }
    return cutoff;
}

function formatSqliteAuditTimestamp(value) {
    return normalizeAuditCutoff(value)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '');
}

function createPostgresAdminAuditRetentionRepository(database) {
    if (!database?.pool || typeof database.pool.connect !== 'function') {
        throw new Error('Postgres admin audit retention requires a connection pool.');
    }

    async function deleteExpiredAuditEntries({ cutoff, batchSize, maxBatches }) {
        const normalizedCutoff = normalizeAuditCutoff(cutoff);
        const normalizedBatchSize = normalizePositiveInteger(batchSize, 'Admin audit cleanup batch size');
        const normalizedMaxBatches = normalizePositiveInteger(maxBatches, 'Admin audit cleanup max batches');
        const client = await database.pool.connect();
        let lockAcquired = false;
        let deletedCount = 0;
        let batchCount = 0;
        let hasMore = false;
        let cleanupError = null;

        try {
            const lockResult = await client.query(
                POSTGRES_TRY_ADMIN_AUDIT_CLEANUP_LOCK_SQL,
                POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS
            );
            lockAcquired = lockResult.rows?.[0]?.acquired === true;
            if (!lockAcquired) {
                return { lockAcquired: false, deletedCount: 0, batchCount: 0, hasMore: false };
            }

            while (batchCount < normalizedMaxBatches) {
                const deleteResult = await client.query(
                    POSTGRES_DELETE_EXPIRED_ADMIN_AUDIT_SQL,
                    [normalizedCutoff, normalizedBatchSize]
                );
                const deletedInBatch = Number(deleteResult.rowCount) || 0;
                deletedCount += deletedInBatch;
                if (deletedInBatch > 0) batchCount += 1;
                if (deletedInBatch < normalizedBatchSize) {
                    hasMore = false;
                    break;
                }
                hasMore = batchCount >= normalizedMaxBatches;
            }

            return { lockAcquired: true, deletedCount, batchCount, hasMore };
        } catch (error) {
            cleanupError = error;
            throw error;
        } finally {
            let unlockError = null;
            if (lockAcquired) {
                try {
                    await client.query(
                        POSTGRES_RELEASE_ADMIN_AUDIT_CLEANUP_LOCK_SQL,
                        POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS
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
        deleteExpiredAuditEntries
    };
}

function createSqliteAdminAuditRetentionRepository(database) {
    if (typeof database?.prepare !== 'function') {
        throw new Error('SQLite admin audit retention requires a database connection.');
    }

    const deleteExpiredBatch = database.prepare(SQLITE_DELETE_EXPIRED_ADMIN_AUDIT_SQL);

    async function deleteExpiredAuditEntries({ cutoff, batchSize, maxBatches }) {
        const normalizedBatchSize = normalizePositiveInteger(batchSize, 'Admin audit cleanup batch size');
        const normalizedMaxBatches = normalizePositiveInteger(maxBatches, 'Admin audit cleanup max batches');
        const sqliteCutoff = formatSqliteAuditTimestamp(cutoff);
        let deletedCount = 0;
        let batchCount = 0;
        let hasMore = false;

        while (batchCount < normalizedMaxBatches) {
            const result = deleteExpiredBatch.run(sqliteCutoff, normalizedBatchSize);
            const deletedInBatch = Number(result.changes) || 0;
            deletedCount += deletedInBatch;
            if (deletedInBatch > 0) batchCount += 1;
            if (deletedInBatch < normalizedBatchSize) {
                hasMore = false;
                break;
            }
            hasMore = batchCount >= normalizedMaxBatches;
        }

        return { lockAcquired: true, deletedCount, batchCount, hasMore };
    }

    return {
        provider: 'sqlite',
        deleteExpiredAuditEntries
    };
}

function createAdminAuditRetentionRepository(databaseOrRepository) {
    if (typeof databaseOrRepository?.deleteExpiredAuditEntries === 'function') {
        return databaseOrRepository;
    }
    if (databaseOrRepository?.provider === 'postgres' || databaseOrRepository?.pool) {
        return createPostgresAdminAuditRetentionRepository(databaseOrRepository);
    }
    if (typeof databaseOrRepository?.prepare === 'function') {
        return createSqliteAdminAuditRetentionRepository(databaseOrRepository);
    }
    throw new Error('Unsupported database adapter for admin audit retention.');
}

module.exports = {
    POSTGRES_ADMIN_AUDIT_CLEANUP_LOCK_KEYS,
    POSTGRES_TRY_ADMIN_AUDIT_CLEANUP_LOCK_SQL,
    POSTGRES_RELEASE_ADMIN_AUDIT_CLEANUP_LOCK_SQL,
    POSTGRES_DELETE_EXPIRED_ADMIN_AUDIT_SQL,
    SQLITE_DELETE_EXPIRED_ADMIN_AUDIT_SQL,
    normalizePositiveInteger,
    normalizeAuditCutoff,
    formatSqliteAuditTimestamp,
    createAdminAuditRetentionRepository,
    createPostgresAdminAuditRetentionRepository,
    createSqliteAdminAuditRetentionRepository
};
