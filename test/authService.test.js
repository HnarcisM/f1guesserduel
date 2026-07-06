const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthService } = require('../server/auth/authService');
const { verifyPassword } = require('../server/auth/passwordService');

function createFakeDb() {
    let nextUserId = 1;
    const users = new Map();

    function findUserByEmail(email) {
        for (const user of users.values()) {
            if (user.email.toLowerCase() === email.toLowerCase()) return user;
        }
        return null;
    }

    function hasUsername(username) {
        for (const user of users.values()) {
            if (user.username.toLowerCase() === username.toLowerCase()) return true;
        }
        return false;
    }

    return {
        users,
        prepare(sql) {
            if (sql.includes('INSERT INTO users')) {
                return {
                    run({ username, email, passwordHash }) {
                        if (hasUsername(username) || findUserByEmail(email)) {
                            const error = new Error('unique constraint failed');
                            error.code = 'SQLITE_CONSTRAINT_UNIQUE';
                            throw error;
                        }

                        const id = nextUserId;
                        nextUserId += 1;
                        users.set(id, {
                            id,
                            username,
                            email,
                            password_hash: passwordHash,
                            createdAt: '2026-07-06T00:00:00.000Z',
                            last_seen_at: null
                        });
                        return { lastInsertRowid: id };
                    }
                };
            }

            if (sql.includes('FROM users') && sql.includes('WHERE email')) {
                return {
                    get(email) {
                        return findUserByEmail(email);
                    }
                };
            }

            if (sql.includes('FROM users') && sql.includes('WHERE id')) {
                return {
                    get(id) {
                        return users.get(Number(id)) || null;
                    }
                };
            }

            if (sql.includes('UPDATE users SET last_seen_at')) {
                return {
                    run(id) {
                        const user = users.get(Number(id));
                        if (user) user.last_seen_at = 'updated';
                        return { changes: user ? 1 : 0 };
                    }
                };
            }

            throw new Error(`Unexpected SQL in fake db: ${sql}`);
        }
    };
}

function createFakeSessionService() {
    let nextToken = 1;
    return {
        createSession(userId) {
            return { userId, token: `session-${nextToken++}` };
        }
    };
}

test('auth service registers users with async password hashing', async () => {
    const db = createFakeDb();
    const authService = createAuthService(db, createFakeSessionService());

    const result = await authService.register({
        username: 'Narcis',
        email: 'NARCIS@example.com',
        password: 'StrongPassword123!'
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.username, 'Narcis');
    assert.equal(result.user.email, 'narcis@example.com');
    assert.equal(result.session.token, 'session-1');

    const storedUser = db.users.get(result.user.id);
    assert.notEqual(storedUser.password_hash, 'StrongPassword123!');
    assert.equal(await verifyPassword('StrongPassword123!', storedUser.password_hash), true);
});

test('auth service login awaits async password verification', async () => {
    const db = createFakeDb();
    const authService = createAuthService(db, createFakeSessionService());

    await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const failedLogin = await authService.login({
        email: 'narcis@example.com',
        password: 'wrong-password'
    });
    assert.equal(failedLogin.ok, false);
    assert.equal(failedLogin.status, 401);

    const loginResult = await authService.login({
        email: 'NARCIS@example.com',
        password: 'StrongPassword123!'
    });
    assert.equal(loginResult.ok, true);
    assert.equal(loginResult.user.username, 'Narcis');
    assert.equal(loginResult.session.token, 'session-2');
});
