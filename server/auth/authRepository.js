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
        SELECT id, username, email, password_hash, created_at AS createdAt
        FROM users
        WHERE email = ?
    `);

    const findByIdStmt = db.prepare(`
        SELECT id, username, email, created_at AS createdAt
        FROM users
        WHERE id = ?
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
            users.created_at AS createdAt
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
          AND datetime(sessions.expires_at) > datetime('now')
    `);

    const deleteSessionStmt = db.prepare(`
        DELETE FROM sessions WHERE token_hash = ?
    `);

    const deleteExpiredStmt = db.prepare(`
        DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')
    `);

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
                RETURNING id, username, email, created_at AS "createdAt"
            `, [username, email, passwordHash]);
            return normalizeUserRow(row);
        },
        async findUserByEmail(email) {
            const row = await queryOne(`
                SELECT id, username, email, password_hash, created_at AS "createdAt"
                FROM users
                WHERE lower(email) = lower($1)
            `, [email]);
            return normalizeUserRow(row);
        },
        async findUserById(userId) {
            const row = await queryOne(`
                SELECT id, username, email, created_at AS "createdAt"
                FROM users
                WHERE id = $1
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
                    users.created_at AS "createdAt"
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = $1
                  AND sessions.expires_at > now()
            `, [tokenHash]);
            return normalizeSessionUserRow(row);
        },
        async deleteSessionByHash(tokenHash) {
            return database.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
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
