const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'f1_session';
const SESSION_MAX_AGE_DAYS = 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const SOCKET_AUTH_TOKEN_MAX_AGE_MS = 2 * 60 * 1000;
const SOCKET_AUTH_SECRET = process.env.SOCKET_AUTH_SECRET || process.env.SESSION_SECRET || 'f1-guesser-duel-dev-socket-auth-secret';

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signSocketAuthPayload(encodedPayload) {
    return crypto
        .createHmac('sha256', SOCKET_AUTH_SECRET)
        .update(encodedPayload)
        .digest('base64url');
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
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

    function getUserBySessionHash(sessionHash) {
        if (!sessionHash || typeof sessionHash !== 'string') return null;
        return getSessionUserStmt.get(sessionHash) || null;
    }

    function getUserByToken(token) {
        if (!token || typeof token !== 'string') return null;
        return getUserBySessionHash(hashToken(token));
    }

    function createSocketAuthToken(sessionToken) {
        if (!sessionToken || typeof sessionToken !== 'string') return null;

        const sessionHash = hashToken(sessionToken);
        const user = getUserBySessionHash(sessionHash);
        if (!user) return null;

        const payload = {
            sessionHash,
            exp: Date.now() + SOCKET_AUTH_TOKEN_MAX_AGE_MS
        };
        const encodedPayload = base64UrlEncode(JSON.stringify(payload));
        const signature = signSocketAuthPayload(encodedPayload);

        return `${encodedPayload}.${signature}`;
    }

    function getUserBySocketAuthToken(socketAuthToken) {
        if (!socketAuthToken || typeof socketAuthToken !== 'string') return null;

        const [encodedPayload, signature] = socketAuthToken.split('.');
        if (!encodedPayload || !signature) return null;

        const expectedSignature = signSocketAuthPayload(encodedPayload);
        if (!safeEqual(signature, expectedSignature)) return null;

        try {
            const payload = JSON.parse(base64UrlDecode(encodedPayload));
            if (!payload || typeof payload.sessionHash !== 'string') return null;
            if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
            return getUserBySessionHash(payload.sessionHash);
        } catch (error) {
            return null;
        }
    }

    function destroySession(token) {
        if (!token || typeof token !== 'string') return;
        deleteSessionStmt.run(hashToken(token));
    }

    return {
        createSession,
        getUserByToken,
        createSocketAuthToken,
        getUserBySocketAuthToken,
        destroySession,
        cookieName: SESSION_COOKIE_NAME,
        maxAgeMs: SESSION_MAX_AGE_MS
    };
}

module.exports = {
    createSessionService,
    SESSION_COOKIE_NAME,
    SOCKET_AUTH_TOKEN_MAX_AGE_MS
};
