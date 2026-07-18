const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionService, hashToken } = require('../server/auth/sessionService');

function createFakeSessionRepository() {
    const users = new Map([
        [1, {
            id: 1,
            username: 'Narcis',
            email: 'narcis@example.com',
            avatarKey: 'helmet-green',
            createdAt: '2026-07-01T00:00:00.000Z'
        }]
    ]);
    const sessions = new Map();

    return {
        users,
        sessions,
        async createSession({ userId, tokenHash, expiresAt }) {
            sessions.set(tokenHash, { userId, tokenHash, expiresAt });
            return { changes: 1 };
        },
        async getSessionUserByHash(tokenHash) {
            const session = sessions.get(tokenHash);
            if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
            return users.get(session.userId) || null;
        },
        async deleteSessionByHash(tokenHash) {
            const existed = sessions.delete(tokenHash);
            return { changes: existed ? 1 : 0 };
        },
        async deleteSessionsByUserId(userId) {
            let changes = 0;
            for (const [tokenHash, session] of sessions.entries()) {
                if (session.userId === userId) {
                    sessions.delete(tokenHash);
                    changes += 1;
                }
            }
            return { changes };
        },
        async deleteOtherSessionsByUserId(userId, currentTokenHash) {
            let changes = 0;
            for (const [tokenHash, session] of sessions.entries()) {
                if (session.userId === userId && tokenHash !== currentTokenHash) {
                    sessions.delete(tokenHash);
                    changes += 1;
                }
            }
            return { changes };
        },
        async deleteExpiredSessions() {
            let changes = 0;
            for (const [tokenHash, session] of sessions.entries()) {
                if (new Date(session.expiresAt).getTime() <= Date.now()) {
                    sessions.delete(tokenHash);
                    changes += 1;
                }
            }
            return { changes };
        }
    };
}

function createTestSessionService(options = {}) {
    const repository = createFakeSessionRepository();
    return {
        repository,
        sessionService: createSessionService(repository, options)
    };
}

test('socket auth token resolves the user from an active session', async () => {
    const { sessionService } = createTestSessionService();
    const session = await sessionService.createSession(1);
    const socketAuthToken = await sessionService.createSocketAuthToken(session.token);

    const user = await sessionService.getUserBySocketAuthToken(socketAuthToken);

    assert.equal(user.username, 'Narcis');
    assert.equal(user.email, 'narcis@example.com');
    assert.equal(user.avatarKey, 'helmet-green');
});

test('socket auth token rejects tampered payloads', async () => {
    const { sessionService } = createTestSessionService();
    const session = await sessionService.createSession(1);
    const socketAuthToken = await sessionService.createSocketAuthToken(session.token);
    const tamperedToken = socketAuthToken.replace(/.$/, socketAuthToken.endsWith('a') ? 'b' : 'a');

    assert.equal(await sessionService.getUserBySocketAuthToken(tamperedToken), null);
});

test('socket auth token stops working after logout destroys the session', async () => {
    const { sessionService } = createTestSessionService();
    const session = await sessionService.createSession(1);
    const socketAuthToken = await sessionService.createSocketAuthToken(session.token);

    await sessionService.destroySession(session.token);

    assert.equal(await sessionService.getUserBySocketAuthToken(socketAuthToken), null);
});

test('cleanupExpiredSessions removes only expired sessions', async () => {
    const { repository, sessionService } = createTestSessionService();
    const activeExpiresAt = new Date(Date.now() + 60_000).toISOString();
    const expiredExpiresAt = new Date(Date.now() - 60_000).toISOString();

    repository.sessions.set('active-session', { userId: 1, tokenHash: 'active-session', expiresAt: activeExpiresAt });
    repository.sessions.set('expired-session', { userId: 1, tokenHash: 'expired-session', expiresAt: expiredExpiresAt });

    const result = await sessionService.cleanupExpiredSessions();

    assert.equal(result.changes, 1);
    assert.equal(repository.sessions.has('active-session'), true);
    assert.equal(repository.sessions.has('expired-session'), false);
});

test('startExpiredSessionCleanup can be disabled with a non-positive interval', () => {
    const { sessionService } = createTestSessionService({ sessionCleanupIntervalMs: 0 });

    const stopCleanup = sessionService.startExpiredSessionCleanup();

    assert.equal(typeof stopCleanup, 'function');
    assert.doesNotThrow(() => stopCleanup());
});

test('session service hashes tokens before storing them', async () => {
    const { repository, sessionService } = createTestSessionService();
    const session = await sessionService.createSession(1);

    assert.equal(repository.sessions.has(session.token), false);
    assert.equal(repository.sessions.has(hashToken(session.token)), true);
});

test('password changes keep the current session and revoke every other user session', async () => {
    const { repository, sessionService } = createTestSessionService();
    const currentSession = await sessionService.createSession(1);
    const otherSession = await sessionService.createSession(1);

    const result = await sessionService.destroyOtherSessionsForUser(1, currentSession.token);

    assert.equal(result.changes, 1);
    assert.equal(repository.sessions.has(hashToken(currentSession.token)), true);
    assert.equal(repository.sessions.has(hashToken(otherSession.token)), false);
});

test('logout everywhere revokes the current session and all other user sessions', async () => {
    const { repository, sessionService } = createTestSessionService();
    const firstSession = await sessionService.createSession(1);
    const secondSession = await sessionService.createSession(1);

    const result = await sessionService.destroyAllSessionsForUser(1);

    assert.equal(result.changes, 2);
    assert.equal(repository.sessions.has(hashToken(firstSession.token)), false);
    assert.equal(repository.sessions.has(hashToken(secondSession.token)), false);
});
