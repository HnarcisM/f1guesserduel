const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionService } = require('../server/auth/sessionService');

function createFakeDb() {
    const users = new Map([
        [1, { id: 1, username: 'Narcis', email: 'narcis@example.com', createdAt: '2026-07-01T00:00:00.000Z' }]
    ]);
    const sessions = new Map();

    const fakeDb = {
        prepare(sql) {
            if (sql.includes('INSERT INTO sessions')) {
                return {
                    run({ userId, tokenHash, expiresAt }) {
                        sessions.set(tokenHash, { userId, tokenHash, expiresAt });
                    }
                };
            }

            if (sql.includes('FROM sessions') && sql.includes('JOIN users')) {
                return {
                    get(tokenHash) {
                        const session = sessions.get(tokenHash);
                        if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
                        return users.get(session.userId) || null;
                    }
                };
            }

            if (sql.includes('DELETE FROM sessions WHERE token_hash')) {
                return {
                    run(tokenHash) {
                        sessions.delete(tokenHash);
                    }
                };
            }

            if (sql.includes('DELETE FROM sessions WHERE datetime(expires_at)')) {
                return {
                    run() {
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

            throw new Error(`Unexpected SQL in fake db: ${sql}`);
        },
        sessions
    };

    return fakeDb;
}

function createTestSessionService(options = {}) {
    const db = createFakeDb();
    return {
        db,
        sessionService: createSessionService(db, options)
    };
}

test('socket auth token resolves the user from an active session', () => {
    const { sessionService } = createTestSessionService();
    const session = sessionService.createSession(1);
    const socketAuthToken = sessionService.createSocketAuthToken(session.token);

    const user = sessionService.getUserBySocketAuthToken(socketAuthToken);

    assert.equal(user.username, 'Narcis');
    assert.equal(user.email, 'narcis@example.com');
});

test('socket auth token rejects tampered payloads', () => {
    const { sessionService } = createTestSessionService();
    const session = sessionService.createSession(1);
    const socketAuthToken = sessionService.createSocketAuthToken(session.token);
    const tamperedToken = socketAuthToken.replace(/.$/, socketAuthToken.endsWith('a') ? 'b' : 'a');

    assert.equal(sessionService.getUserBySocketAuthToken(tamperedToken), null);
});

test('socket auth token stops working after logout destroys the session', () => {
    const { sessionService } = createTestSessionService();
    const session = sessionService.createSession(1);
    const socketAuthToken = sessionService.createSocketAuthToken(session.token);

    sessionService.destroySession(session.token);

    assert.equal(sessionService.getUserBySocketAuthToken(socketAuthToken), null);
});

test('cleanupExpiredSessions removes only expired sessions', () => {
    const { db, sessionService } = createTestSessionService();
    const activeExpiresAt = new Date(Date.now() + 60_000).toISOString();
    const expiredExpiresAt = new Date(Date.now() - 60_000).toISOString();

    db.sessions.set('active-session', { userId: 1, tokenHash: 'active-session', expiresAt: activeExpiresAt });
    db.sessions.set('expired-session', { userId: 1, tokenHash: 'expired-session', expiresAt: expiredExpiresAt });

    const result = sessionService.cleanupExpiredSessions();

    assert.equal(result.changes, 1);
    assert.equal(db.sessions.has('active-session'), true);
    assert.equal(db.sessions.has('expired-session'), false);
});

test('startExpiredSessionCleanup can be disabled with a non-positive interval', () => {
    const { sessionService } = createTestSessionService({ sessionCleanupIntervalMs: 0 });

    const stopCleanup = sessionService.startExpiredSessionCleanup();

    assert.equal(typeof stopCleanup, 'function');
    assert.doesNotThrow(() => stopCleanup());
});
