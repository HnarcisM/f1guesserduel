function normalizeUserRow(row) {
    if (!row) return null;
    return {
        ...row,
        id: Number(row.id),
        createdAt: row.createdAt || row.created_at
    };
}

function normalizeSessionUserRow(row) {
    return normalizeUserRow(row);
}

function isUniqueConstraintError(error) {
    return error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
        || error?.code === '23505';
}

function createSqliteAuthRepository(db) {
    const createUserStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, last_seen_at)
        VALUES (@username, @email, @passwordHash, datetime('now'))
    `);

    const findByEmailStmt = db.prepare(`
        SELECT
            users.id,
            users.username,
            users.email,
            users.password_hash,
            users.created_at AS createdAt,
            COALESCE(user_profiles.avatar_key, 'helmet-red') AS avatarKey,
            username_change_limits.changed_at AS usernameChangedAt
        FROM users
        LEFT JOIN user_profiles ON user_profiles.user_id = users.id
        LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
        WHERE users.email = ?
    `);

    const findByIdStmt = db.prepare(`
        SELECT
            users.id,
            users.username,
            users.email,
            users.created_at AS createdAt,
            COALESCE(user_profiles.avatar_key, 'helmet-red') AS avatarKey,
            username_change_limits.changed_at AS usernameChangedAt
        FROM users
        LEFT JOIN user_profiles ON user_profiles.user_id = users.id
        LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
        WHERE users.id = ?
    `);

    const findCredentialsByIdStmt = db.prepare(`
        SELECT
            users.id,
            users.username,
            users.email,
            users.password_hash,
            users.created_at AS createdAt,
            COALESCE(user_profiles.avatar_key, 'helmet-red') AS avatarKey,
            username_change_limits.changed_at AS usernameChangedAt
        FROM users
        LEFT JOIN user_profiles ON user_profiles.user_id = users.id
        LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
        WHERE users.id = ?
    `);

    const updateUsernameStmt = db.prepare(`
        UPDATE users
        SET username = ?
        WHERE id = ?
          AND NOT EXISTS (
              SELECT 1
              FROM username_change_limits
              WHERE user_id = ?
                AND datetime(changed_at) > datetime('now', '-7 days')
          )
    `);

    const upsertUsernameChangeLimitStmt = db.prepare(`
        INSERT INTO username_change_limits (user_id, changed_at)
        VALUES (?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET changed_at = datetime('now')
    `);

    const updatePasswordHashStmt = db.prepare(`
        UPDATE users SET password_hash = ? WHERE id = ?
    `);

    const upsertAvatarStmt = db.prepare(`
        INSERT INTO user_profiles (user_id, avatar_key, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            avatar_key = excluded.avatar_key,
            updated_at = datetime('now')
    `);

    const updateLastSeenStmt = db.prepare(`
        UPDATE users SET last_seen_at = datetime('now') WHERE id = ?
    `);

    const createSessionStmt = db.prepare(`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (@userId, @tokenHash, @expiresAt)
    `);

    const getSessionUserStmt = db.prepare(`
        SELECT
            users.id,
            users.username,
            users.email,
            users.created_at AS createdAt,
            COALESCE(user_profiles.avatar_key, 'helmet-red') AS avatarKey,
            username_change_limits.changed_at AS usernameChangedAt
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        LEFT JOIN user_profiles ON user_profiles.user_id = users.id
        LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
        WHERE sessions.token_hash = ?
          AND datetime(sessions.expires_at) > datetime('now')
    `);

    const deleteSessionStmt = db.prepare(`
        DELETE FROM sessions WHERE token_hash = ?
    `);

    const deleteUserSessionsStmt = db.prepare(`
        DELETE FROM sessions WHERE user_id = ?
    `);

    const deleteOtherUserSessionsStmt = db.prepare(`
        DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?
    `);

    const deleteExpiredStmt = db.prepare(`
        DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')
    `);
    const updateUsernameTransaction = db.transaction((userId, username) => {
        const result = updateUsernameStmt.run(username, userId, userId);
        if (result.changes !== 1) return null;
        upsertUsernameChangeLimitStmt.run(userId);
        return findByIdStmt.get(userId);
    });

    return {
        provider: 'sqlite',
        isUniqueConstraintError,
        async createUser({ username, email, passwordHash }) {
            const result = createUserStmt.run({ username, email, passwordHash });
            return normalizeUserRow(findByIdStmt.get(result.lastInsertRowid));
        },
        async findUserByEmail(email) {
            return normalizeUserRow(findByEmailStmt.get(email));
        },
        async findUserById(userId) {
            return normalizeUserRow(findByIdStmt.get(userId));
        },
        async findUserCredentialsById(userId) {
            return normalizeUserRow(findCredentialsByIdStmt.get(userId));
        },
        async updateUsername(userId, username) {
            return normalizeUserRow(updateUsernameTransaction(userId, username));
        },
        async updatePasswordHash(userId, passwordHash) {
            return updatePasswordHashStmt.run(passwordHash, userId);
        },
        async updateAvatar(userId, avatarKey) {
            upsertAvatarStmt.run(userId, avatarKey);
            return normalizeUserRow(findByIdStmt.get(userId));
        },
        async updateLastSeen(userId) {
            return updateLastSeenStmt.run(userId);
        },
        async createSession({ userId, tokenHash, expiresAt }) {
            return createSessionStmt.run({ userId, tokenHash, expiresAt });
        },
        async getSessionUserByHash(tokenHash) {
            return normalizeSessionUserRow(getSessionUserStmt.get(tokenHash));
        },
        async deleteSessionByHash(tokenHash) {
            return deleteSessionStmt.run(tokenHash);
        },
        async deleteSessionsByUserId(userId) {
            return deleteUserSessionsStmt.run(userId);
        },
        async deleteOtherSessionsByUserId(userId, currentTokenHash) {
            return deleteOtherUserSessionsStmt.run(userId, currentTokenHash);
        },
        async deleteExpiredSessions() {
            return deleteExpiredStmt.run();
        }
    };
}

function createPostgresAuthRepository(database) {
    async function queryOne(sql, params = []) {
        const result = await database.query(sql, params);
        return result.rows[0] || null;
    }

    return {
        provider: 'postgres',
        isUniqueConstraintError,
        async createUser({ username, email, passwordHash }) {
            const row = await queryOne(`
                INSERT INTO users (username, email, password_hash, last_seen_at)
                VALUES ($1, $2, $3, now())
                RETURNING
                    id,
                    username,
                    email,
                    created_at AS "createdAt",
                    'helmet-red' AS "avatarKey",
                    NULL AS "usernameChangedAt"
            `, [username, email, passwordHash]);
            return normalizeUserRow(row);
        },
        async findUserByEmail(email) {
            const row = await queryOne(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.password_hash,
                    users.created_at AS "createdAt",
                    COALESCE(user_profiles.avatar_key, 'helmet-red') AS "avatarKey",
                    username_change_limits.changed_at AS "usernameChangedAt"
                FROM users
                LEFT JOIN user_profiles ON user_profiles.user_id = users.id
                LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
                WHERE lower(users.email) = lower($1)
            `, [email]);
            return normalizeUserRow(row);
        },
        async findUserById(userId) {
            const row = await queryOne(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    COALESCE(user_profiles.avatar_key, 'helmet-red') AS "avatarKey",
                    username_change_limits.changed_at AS "usernameChangedAt"
                FROM users
                LEFT JOIN user_profiles ON user_profiles.user_id = users.id
                LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
                WHERE users.id = $1
            `, [userId]);
            return normalizeUserRow(row);
        },
        async findUserCredentialsById(userId) {
            const row = await queryOne(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.password_hash,
                    users.created_at AS "createdAt",
                    COALESCE(user_profiles.avatar_key, 'helmet-red') AS "avatarKey",
                    username_change_limits.changed_at AS "usernameChangedAt"
                FROM users
                LEFT JOIN user_profiles ON user_profiles.user_id = users.id
                LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
                WHERE users.id = $1
            `, [userId]);
            return normalizeUserRow(row);
        },
        async updateUsername(userId, username) {
            const row = await queryOne(`
                WITH claimed_limit AS (
                    INSERT INTO username_change_limits (user_id, changed_at)
                    SELECT users.id, now()
                    FROM users
                    WHERE users.id = $1
                    ON CONFLICT (user_id) DO UPDATE SET changed_at = EXCLUDED.changed_at
                    WHERE username_change_limits.changed_at <= now() - INTERVAL '7 days'
                    RETURNING user_id, changed_at
                ),
                updated_user AS (
                    UPDATE users
                    SET username = $2
                    FROM claimed_limit
                    WHERE users.id = claimed_limit.user_id
                    RETURNING users.id, users.username, users.email, users.created_at
                )
                SELECT
                    updated_user.id,
                    updated_user.username,
                    updated_user.email,
                    updated_user.created_at AS "createdAt",
                    COALESCE(user_profiles.avatar_key, 'helmet-red') AS "avatarKey",
                    claimed_limit.changed_at AS "usernameChangedAt"
                FROM updated_user
                JOIN claimed_limit ON claimed_limit.user_id = updated_user.id
                LEFT JOIN user_profiles ON user_profiles.user_id = updated_user.id
            `, [userId, username]);
            return normalizeUserRow(row);
        },
        async updatePasswordHash(userId, passwordHash) {
            return database.query(`
                UPDATE users
                SET password_hash = $2
                WHERE id = $1
            `, [userId, passwordHash]);
        },
        async updateAvatar(userId, avatarKey) {
            await database.query(`
                INSERT INTO user_profiles (user_id, avatar_key, updated_at)
                VALUES ($1, $2, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    avatar_key = EXCLUDED.avatar_key,
                    updated_at = now()
            `, [userId, avatarKey]);
            const row = await queryOne(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    user_profiles.avatar_key AS "avatarKey",
                    username_change_limits.changed_at AS "usernameChangedAt"
                FROM users
                JOIN user_profiles ON user_profiles.user_id = users.id
                LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
                WHERE users.id = $1
            `, [userId]);
            return normalizeUserRow(row);
        },
        async updateLastSeen(userId) {
            return database.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
        },
        async createSession({ userId, tokenHash, expiresAt }) {
            return database.query(`
                INSERT INTO sessions (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
            `, [userId, tokenHash, expiresAt]);
        },
        async getSessionUserByHash(tokenHash) {
            const row = await queryOne(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    COALESCE(user_profiles.avatar_key, 'helmet-red') AS "avatarKey",
                    username_change_limits.changed_at AS "usernameChangedAt"
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                LEFT JOIN user_profiles ON user_profiles.user_id = users.id
                LEFT JOIN username_change_limits ON username_change_limits.user_id = users.id
                WHERE sessions.token_hash = $1
                  AND sessions.expires_at > now()
            `, [tokenHash]);
            return normalizeSessionUserRow(row);
        },
        async deleteSessionByHash(tokenHash) {
            return database.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
        },
        async deleteSessionsByUserId(userId) {
            const result = await database.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
            return { changes: result.rowCount };
        },
        async deleteOtherSessionsByUserId(userId, currentTokenHash) {
            const result = await database.query(`
                DELETE FROM sessions
                WHERE user_id = $1 AND token_hash <> $2
            `, [userId, currentTokenHash]);
            return { changes: result.rowCount };
        },
        async deleteExpiredSessions() {
            const result = await database.query('DELETE FROM sessions WHERE expires_at <= now()');
            return { changes: result.rowCount };
        }
    };
}

function createAuthRepository(database) {
    if (!database || typeof database !== 'object') {
        throw new Error('A database instance is required to create the auth repository.');
    }

    if (typeof database.createUser === 'function' || typeof database.createSession === 'function') {
        return {
            isUniqueConstraintError,
            ...database
        };
    }

    if (database.provider === 'postgres' || typeof database.query === 'function') {
        return createPostgresAuthRepository(database);
    }

    if (typeof database.prepare === 'function') {
        return createSqliteAuthRepository(database);
    }

    throw new Error('Unsupported database adapter for auth repository.');
}

module.exports = {
    createAuthRepository,
    createSqliteAuthRepository,
    createPostgresAuthRepository,
    isUniqueConstraintError
};
