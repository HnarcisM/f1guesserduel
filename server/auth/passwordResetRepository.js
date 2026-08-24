'use strict';

function normalizeResetResult(row, sessionsRevoked = 0) {
    if (!row) return null;
    const userId = Number(row.userId ?? row.user_id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
    return {
        userId,
        sessionsRevoked: Math.max(0, Number(sessionsRevoked) || 0)
    };
}

function createSqlitePasswordResetRepository(db) {
    const replaceTokenForEmailStmt = db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        SELECT users.id, @tokenHash, @expiresAt
        FROM users
        WHERE users.email = @email COLLATE NOCASE
        ON CONFLICT(user_id) DO UPDATE SET
            token_hash = excluded.token_hash,
            created_at = datetime('now'),
            expires_at = excluded.expires_at,
            consumed_at = NULL
        RETURNING user_id AS userId
    `);
    const consumeTokenStmt = db.prepare(`
        UPDATE password_reset_tokens
        SET consumed_at = datetime('now')
        WHERE token_hash = ?
          AND consumed_at IS NULL
          AND datetime(expires_at) > datetime('now')
        RETURNING user_id AS userId
    `);
    const updatePasswordStmt = db.prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
    `);
    const deleteSessionsStmt = db.prepare(`
        DELETE FROM sessions
        WHERE user_id = ?
    `);

    const consumeTokenTransaction = db.transaction((tokenHash, passwordHash) => {
        const tokenRow = consumeTokenStmt.get(tokenHash);
        if (!tokenRow) return null;

        const passwordUpdate = updatePasswordStmt.run(passwordHash, tokenRow.userId);
        if (passwordUpdate.changes !== 1) {
            throw new Error('Password reset could not update the target account.');
        }

        const revoked = deleteSessionsStmt.run(tokenRow.userId);
        return normalizeResetResult(tokenRow, revoked.changes);
    });

    return {
        provider: 'sqlite',
        async replaceTokenForEmail({ email, tokenHash, expiresAt }) {
            const row = replaceTokenForEmailStmt.get({ email, tokenHash, expiresAt });
            return normalizeResetResult(row);
        },
        async consumeTokenAndResetPassword({ tokenHash, passwordHash }) {
            return consumeTokenTransaction(tokenHash, passwordHash);
        }
    };
}

function resolvePostgresConnect(database) {
    if (database?.pool && typeof database.pool.connect === 'function') {
        return () => database.pool.connect();
    }
    if (typeof database?.connect === 'function') {
        return () => database.connect();
    }
    return null;
}

function createPostgresPasswordResetRepository(database) {
    const connect = resolvePostgresConnect(database);
    if (!connect) {
        throw new Error('Postgres password reset repository requires transactional connection access.');
    }

    async function rollback(client, originalError) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            originalError.rollbackError = rollbackError;
        }
    }

    return {
        provider: 'postgres',
        async replaceTokenForEmail({ email, tokenHash, expiresAt }) {
            const result = await database.query(`
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                SELECT users.id, $2, $3
                FROM users
                WHERE lower(users.email) = lower($1)
                ON CONFLICT (user_id) DO UPDATE SET
                    token_hash = EXCLUDED.token_hash,
                    created_at = now(),
                    expires_at = EXCLUDED.expires_at,
                    consumed_at = NULL
                RETURNING user_id AS "userId"
            `, [email, tokenHash, expiresAt]);
            return normalizeResetResult(result.rows?.[0]);
        },
        async consumeTokenAndResetPassword({ tokenHash, passwordHash }) {
            const client = await connect();
            let transactionStarted = false;

            try {
                await client.query('BEGIN');
                transactionStarted = true;

                const tokenResult = await client.query(`
                    UPDATE password_reset_tokens
                    SET consumed_at = now()
                    WHERE token_hash = $1
                      AND consumed_at IS NULL
                      AND expires_at > now()
                    RETURNING user_id AS "userId"
                `, [tokenHash]);
                const tokenRow = tokenResult.rows?.[0];
                if (!tokenRow) {
                    await client.query('COMMIT');
                    transactionStarted = false;
                    return null;
                }

                const userId = Number(tokenRow.userId);
                const passwordResult = await client.query(`
                    UPDATE users
                    SET password_hash = $2
                    WHERE id = $1
                `, [userId, passwordHash]);
                if (passwordResult.rowCount !== 1) {
                    throw new Error('Password reset could not update the target account.');
                }

                const sessionResult = await client.query(`
                    DELETE FROM sessions
                    WHERE user_id = $1
                `, [userId]);

                await client.query('COMMIT');
                transactionStarted = false;
                return normalizeResetResult(tokenRow, sessionResult.rowCount);
            } catch (error) {
                if (transactionStarted) await rollback(client, error);
                throw error;
            } finally {
                client.release?.();
            }
        }
    };
}

function createPasswordResetRepository(databaseOrRepository) {
    if (!databaseOrRepository || typeof databaseOrRepository !== 'object') {
        throw new Error('A database or password reset repository is required.');
    }

    if (
        typeof databaseOrRepository.replaceTokenForEmail === 'function'
        && typeof databaseOrRepository.consumeTokenAndResetPassword === 'function'
    ) {
        return databaseOrRepository;
    }

    if (databaseOrRepository.provider === 'postgres' || typeof databaseOrRepository.query === 'function') {
        return createPostgresPasswordResetRepository(databaseOrRepository);
    }

    if (typeof databaseOrRepository.prepare === 'function') {
        return createSqlitePasswordResetRepository(databaseOrRepository);
    }

    throw new Error('Unsupported database adapter for password reset repository.');
}

module.exports = {
    createPasswordResetRepository,
    createPostgresPasswordResetRepository,
    createSqlitePasswordResetRepository,
    normalizeResetResult,
    resolvePostgresConnect
};
