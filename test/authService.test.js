const test = require('node:test');
const assert = require('node:assert/strict');
const asyncHooks = require('node:async_hooks');

const { createAuthService } = require('../server/auth/authService');
const { verifyPassword } = require('../server/auth/passwordService');

function createFakeAuthRepository() {
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
        isUniqueConstraintError(error) {
            return error?.code === '23505' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
        },
        async createUser({ username, email, passwordHash }) {
            if (hasUsername(username) || findUserByEmail(email)) {
                const error = new Error('unique constraint failed');
                error.code = '23505';
                throw error;
            }

            const id = nextUserId;
            nextUserId += 1;
            const user = {
                id,
                username,
                email,
                password_hash: passwordHash,
                createdAt: '2026-07-06T00:00:00.000Z',
                last_seen_at: null
            };
            users.set(id, user);
            return user;
        },
        async findUserByEmail(email) {
            return findUserByEmail(email);
        },
        async findUserById(id) {
            return users.get(Number(id)) || null;
        },
        async findUserCredentialsById(id) {
            return users.get(Number(id)) || null;
        },
        async updateUsername(id, username) {
            if (hasUsername(username) && users.get(Number(id))?.username.toLowerCase() !== username.toLowerCase()) {
                const error = new Error('unique constraint failed');
                error.code = '23505';
                throw error;
            }
            const user = users.get(Number(id));
            if (user) {
                user.username = username;
                user.usernameChangedAt = new Date().toISOString();
            }
            return user || null;
        },
        async updatePasswordHash(id, passwordHash) {
            const user = users.get(Number(id));
            if (user) user.password_hash = passwordHash;
            return { changes: user ? 1 : 0 };
        },
        async updateAvatar(id, avatarKey) {
            const user = users.get(Number(id));
            if (user) user.avatarKey = avatarKey;
            return user || null;
        },
        async updateLastSeen(id) {
            const user = users.get(Number(id));
            if (user) user.last_seen_at = 'updated';
            return { changes: user ? 1 : 0 };
        }
    };
}

function createFakeSessionService() {
    let nextToken = 1;
    return {
        async createSession(userId) {
            return { userId, token: `session-${nextToken++}` };
        }
    };
}

async function countPbkdf2Requests(action) {
    let requestCount = 0;
    const hook = asyncHooks.createHook({
        init(asyncId, type) {
            if (type === 'PBKDF2REQUEST') requestCount += 1;
        }
    });

    hook.enable();
    try {
        await action();
    } finally {
        hook.disable();
    }

    return requestCount;
}

test('auth service registers users with async password hashing', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());

    const result = await authService.register({
        username: 'Narcis',
        email: 'NARCIS@example.com',
        password: 'StrongPassword123!'
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.username, 'Narcis');
    assert.equal(result.user.email, 'narcis@example.com');
    assert.equal(result.user.avatarKey, 'helmet-red');
    assert.equal(result.session.token, 'session-1');

    const storedUser = repository.users.get(result.user.id);
    assert.notEqual(storedUser.password_hash, 'StrongPassword123!');
    assert.equal(await verifyPassword('StrongPassword123!', storedUser.password_hash), true);
});

test('auth service login awaits async password verification', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());

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

test('auth service accepts 64-character passwords and rejects longer credentials', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const password64 = `A${'b'.repeat(61)}1!`;
    const password65 = `${password64}x`;

    assert.equal(password64.length, 64);
    assert.equal(password65.length, 65);

    const registered = await authService.register({
        username: 'BoundaryUser',
        email: 'boundary@example.com',
        password: password64
    });
    const login = await authService.login({
        email: 'boundary@example.com',
        password: password64
    });
    const rejectedRegistration = await authService.register({
        username: 'TooLongPassword',
        email: 'too-long@example.com',
        password: password65
    });
    let rejectedLogin;
    const rejectedLoginHashRequests = await countPbkdf2Requests(async () => {
        rejectedLogin = await authService.login({
            email: 'boundary@example.com',
            password: password65
        });
    });

    assert.equal(registered.ok, true);
    assert.equal(login.ok, true);
    assert.equal(rejectedRegistration.ok, false);
    assert.equal(rejectedRegistration.status, 400);
    assert.match(rejectedRegistration.message, /8 și 64/);
    assert.equal(rejectedLogin.ok, false);
    assert.equal(rejectedLogin.status, 400);
    assert.match(rejectedLogin.message, /maximum 64/);
    assert.equal(rejectedLoginHashRequests, 0);
});

test('auth service performs PBKDF2 verification for an unknown email', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    let loginResult;

    const pbkdf2Requests = await countPbkdf2Requests(async () => {
        loginResult = await authService.login({
            email: 'missing@example.com',
            password: 'WrongPassword123!'
        });
    });

    assert.equal(loginResult.ok, false);
    assert.equal(loginResult.status, 401);
    assert.equal(loginResult.message, 'Email sau parolă greșită.');
    assert.equal(pbkdf2Requests, 1);
});

test('auth service returns conflict when repository reports unique constraint', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());

    await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const duplicate = await authService.register({
        username: 'Narcis',
        email: 'other@example.com',
        password: 'StrongPassword123!'
    });

    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.status, 409);
});

test('account username change requires the current password and preserves safe user fields', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const registered = await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const rejected = await authService.updateUsername({
        userId: registered.user.id,
        username: 'Narcis_New',
        currentPassword: 'wrong-password'
    });
    const updated = await authService.updateUsername({
        userId: registered.user.id,
        username: 'Narcis_New',
        currentPassword: 'StrongPassword123!'
    });

    assert.equal(rejected.status, 401);
    assert.equal(updated.ok, true);
    assert.equal(updated.user.username, 'Narcis_New');
    assert.equal(typeof updated.user.usernameChangeAvailableAt, 'string');
    assert.equal(Object.hasOwn(updated.user, 'password_hash'), false);
});

test('account username cannot be changed again before the seven-day cooldown expires', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const registered = await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const first = await authService.updateUsername({
        userId: registered.user.id,
        username: 'Narcis_One',
        currentPassword: 'StrongPassword123!'
    });
    const blocked = await authService.updateUsername({
        userId: registered.user.id,
        username: 'Narcis_Two',
        currentPassword: 'StrongPassword123!'
    });
    repository.users.get(registered.user.id).usernameChangedAt = new Date(
        Date.now() - (8 * 24 * 60 * 60 * 1000)
    ).toISOString();
    const allowedAfterCooldown = await authService.updateUsername({
        userId: registered.user.id,
        username: 'Narcis_Two',
        currentPassword: 'StrongPassword123!'
    });

    assert.equal(first.ok, true);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
    assert.match(blocked.message, /7 zile/);
    assert.equal(allowedAfterCooldown.ok, true);
    assert.equal(repository.users.get(registered.user.id).username, 'Narcis_Two');
});

test('account password change validates, hashes and replaces the credential', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const registered = await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const samePassword = await authService.updatePassword({
        userId: registered.user.id,
        currentPassword: 'StrongPassword123!',
        newPassword: 'StrongPassword123!'
    });
    const updated = await authService.updatePassword({
        userId: registered.user.id,
        currentPassword: 'StrongPassword123!',
        newPassword: 'AnotherStrongPassword456!'
    });
    const storedUser = repository.users.get(registered.user.id);

    assert.equal(samePassword.status, 400);
    assert.equal(updated.ok, true);
    assert.equal(await verifyPassword('StrongPassword123!', storedUser.password_hash), false);
    assert.equal(await verifyPassword('AnotherStrongPassword456!', storedUser.password_hash), true);
});

test('account password change enforces the 64-character maximum', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const currentPassword = 'StrongPassword123!';
    const password64 = `N${'e'.repeat(61)}1!`;
    const password65 = `${password64}x`;
    const registered = await authService.register({
        username: 'PasswordBoundary',
        email: 'password-boundary@example.com',
        password: currentPassword
    });

    const rejected = await authService.updatePassword({
        userId: registered.user.id,
        currentPassword,
        newPassword: password65
    });
    const accepted = await authService.updatePassword({
        userId: registered.user.id,
        currentPassword,
        newPassword: password64
    });
    const storedUser = repository.users.get(registered.user.id);

    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 400);
    assert.match(rejected.message, /8 și 64/);
    assert.equal(accepted.ok, true);
    assert.equal(await verifyPassword(password64, storedUser.password_hash), true);
});

test('account avatar accepts only server-approved helmet presets', async () => {
    const repository = createFakeAuthRepository();
    const authService = createAuthService(repository, createFakeSessionService());
    const registered = await authService.register({
        username: 'Narcis',
        email: 'narcis@example.com',
        password: 'StrongPassword123!'
    });

    const rejected = await authService.updateAvatar({
        userId: registered.user.id,
        avatarKey: '../../custom-file.svg'
    });
    const updated = await authService.updateAvatar({
        userId: registered.user.id,
        avatarKey: 'HELMET-BLUE'
    });

    assert.equal(rejected.status, 400);
    assert.equal(updated.ok, true);
    assert.equal(updated.user.avatarKey, 'helmet-blue');
    assert.equal(repository.users.get(registered.user.id).avatarKey, 'helmet-blue');
});
