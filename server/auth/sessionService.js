const crypto = require('crypto');
const {
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_MAX_AGE_DAYS,
    DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS,
    DEFAULT_SESSION_CLEANUP_INTERVAL_MS
} = require('../config/appConfig');
const { createAuthRepository } = require('./authRepository');

const SESSION_COOKIE_NAME = DEFAULT_SESSION_COOKIE_NAME;
const SESSION_MAX_AGE_DAYS = DEFAULT_SESSION_MAX_AGE_DAYS;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const SOCKET_AUTH_TOKEN_MAX_AGE_MS = DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS;
const DEFAULT_SOCKET_AUTH_SECRET = 'f1-guesser-duel-dev-socket-auth-secret';

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signSocketAuthPayload(encodedPayload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(encodedPayload)
        .digest('base64url');
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSessionService(databaseOrRepository, options = {}) {
    const repository = createAuthRepository(databaseOrRepository);
    const cookieName = options.cookieName || SESSION_COOKIE_NAME;
    const maxAgeMs = options.sessionMaxAgeMs || SESSION_MAX_AGE_MS;
    const socketAuthTokenMaxAgeMs = options.socketAuthTokenMaxAgeMs || SOCKET_AUTH_TOKEN_MAX_AGE_MS;
    const sessionCleanupIntervalMs = options.sessionCleanupIntervalMs ?? DEFAULT_SESSION_CLEANUP_INTERVAL_MS;
    const socketAuthSecret = options.socketAuthSecret || DEFAULT_SOCKET_AUTH_SECRET;

    async function cleanupExpiredSessions() {
        return repository.deleteExpiredSessions();
    }

    function startExpiredSessionCleanup({ intervalMs = sessionCleanupIntervalMs, logger = console } = {}) {
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            return () => {};
        }

        const timer = setInterval(() => {
            cleanupExpiredSessions().catch(error => {
                logger?.error?.('[sessions] Failed to clean up expired sessions.', { error });
            });
        }, intervalMs);

        timer.unref?.();

        return () => clearInterval(timer);
    }

    async function createSession(userId) {
        await cleanupExpiredSessions();

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + maxAgeMs).toISOString();

        await repository.createSession({ userId, tokenHash, expiresAt });
        return { token, expiresAt };
    }

    async function getUserBySessionHash(sessionHash) {
        if (!sessionHash || typeof sessionHash !== 'string') return null;
        return repository.getSessionUserByHash(sessionHash);
    }

    async function getUserByToken(token) {
        if (!token || typeof token !== 'string') return null;
        return getUserBySessionHash(hashToken(token));
    }

    async function createSocketAuthToken(sessionToken) {
        if (!sessionToken || typeof sessionToken !== 'string') return null;

        const sessionHash = hashToken(sessionToken);
        const user = await getUserBySessionHash(sessionHash);
        if (!user) return null;

        const payload = {
            sessionHash,
            exp: Date.now() + socketAuthTokenMaxAgeMs
        };
        const encodedPayload = base64UrlEncode(JSON.stringify(payload));
        const signature = signSocketAuthPayload(encodedPayload, socketAuthSecret);

        return `${encodedPayload}.${signature}`;
    }

    async function getUserBySocketAuthToken(socketAuthToken) {
        if (!socketAuthToken || typeof socketAuthToken !== 'string') return null;

        const [encodedPayload, signature] = socketAuthToken.split('.');
        if (!encodedPayload || !signature) return null;

        const expectedSignature = signSocketAuthPayload(encodedPayload, socketAuthSecret);
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

    async function destroySession(token) {
        if (!token || typeof token !== 'string') return;
        await repository.deleteSessionByHash(hashToken(token));
    }

    return {
        createSession,
        getUserByToken,
        createSocketAuthToken,
        getUserBySocketAuthToken,
        cleanupExpiredSessions,
        startExpiredSessionCleanup,
        destroySession,
        cookieName,
        maxAgeMs,
        sessionCleanupIntervalMs
    };
}

module.exports = {
    createSessionService,
    hashToken,
    SESSION_COOKIE_NAME,
    SOCKET_AUTH_TOKEN_MAX_AGE_MS,
    DEFAULT_SESSION_CLEANUP_INTERVAL_MS
};
