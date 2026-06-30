const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'f1_session';
const SESSION_MAX_AGE_DAYS = 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionService(db) {
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

    function createSession(userId) {
        deleteExpiredStmt.run();

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();

        createSessionStmt.run({ userId, tokenHash, expiresAt });
        return { token, expiresAt };
    }

    function getUserByToken(token) {
        if (!token || typeof token !== 'string') return null;
        return getSessionUserStmt.get(hashToken(token)) || null;
    }

    function destroySession(token) {
        if (!token || typeof token !== 'string') return;
        deleteSessionStmt.run(hashToken(token));
    }

    return {
        createSession,
        getUserByToken,
        destroySession,
        cookieName: SESSION_COOKIE_NAME,
        maxAgeMs: SESSION_MAX_AGE_MS
    };
}

module.exports = {
    createSessionService,
    SESSION_COOKIE_NAME
};
