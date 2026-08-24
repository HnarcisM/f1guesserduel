'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { after, before, test } = require('node:test');

const { createAuthRepository } = require('../../server/auth/authRepository');
const { createAuthService } = require('../../server/auth/authService');
const { hashPassword } = require('../../server/auth/passwordService');
const { createPasswordResetService } = require('../../server/auth/passwordResetService');
const { createSessionService } = require('../../server/auth/sessionService');
const { createPostgresDatabase } = require('../../server/db/database');

const databaseUrl = process.env.TEST_DATABASE_URL;
const projectRoot = path.join(__dirname, '..', '..');
const schemaFilePath = path.join(projectRoot, 'server', 'db', 'postgresSchema.sql');
const migrationsDirectoryPath = path.join(projectRoot, 'server', 'db', 'migrations', 'postgres');
const silentLogger = { info() {}, warn() {}, error() {} };
const socketAuthSecret = 'password-reset-integration-secret-32-bytes-minimum';

let database;
let testUserId;

before(async () => {
    assert.ok(databaseUrl, 'TEST_DATABASE_URL is required for password reset integration tests.');
    database = await createPostgresDatabase({
        databaseUrl,
        schemaFilePath,
        migrationsDirectoryPath,
        ssl: false,
        maxConnections: 3,
        connectionTimeoutMs: 5_000,
        queryTimeoutMs: 10_000,
        initializationRetryAttempts: 2,
        initializationRetryBaseDelayMs: 250,
        logger: silentLogger
    });
});

after(async () => {
    if (!database) return;
    if (testUserId) await database.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await database.closeConnection();
});

test('real PostgreSQL reset is one-time, changes the password and invalidates HTTP/socket sessions', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `reset-${suffix}@example.test`;
    const oldPassword = 'OldStrongPassword123!';
    const newPassword = 'NewStrongPassword456!';
    const authRepository = createAuthRepository(database);
    const sessionService = createSessionService(database, { socketAuthSecret });
    const authService = createAuthService(database, sessionService);
    const passwordResetService = createPasswordResetService(database);

    const user = await authRepository.createUser({
        username: `reset_${suffix}`,
        email,
        passwordHash: await hashPassword(oldPassword)
    });
    testUserId = user.id;

    const oldSession = await sessionService.createSession(user.id);
    assert.ok(await sessionService.getUserByToken(oldSession.token));
    assert.ok(await sessionService.getUserBySocketAuthToken(oldSession.socketAuthToken));

    const requested = await passwordResetService.requestPasswordReset({ email });
    assert.equal(requested.accepted, true);
    assert.equal(requested.delivery.userId, user.id);
    assert.equal(requested.delivery.email, email);
    assert.match(requested.delivery.token, /^[A-Za-z0-9_-]{43}$/);

    const reset = await passwordResetService.confirmPasswordReset({
        token: requested.delivery.token,
        newPassword
    });
    assert.equal(reset.ok, true);
    assert.ok(reset.sessionsRevoked >= 1);

    assert.equal(await sessionService.getUserByToken(oldSession.token), null);
    assert.equal(await sessionService.getUserBySocketAuthToken(oldSession.socketAuthToken), null);

    const reused = await passwordResetService.confirmPasswordReset({
        token: requested.delivery.token,
        newPassword: 'AnotherStrongPassword789!'
    });
    assert.equal(reused.ok, false);
    assert.equal(reused.status, 400);

    const oldLogin = await authService.login({ email, password: oldPassword });
    assert.equal(oldLogin.ok, false);
    assert.equal(oldLogin.status, 401);

    const newLogin = await authService.login({ email, password: newPassword });
    assert.equal(newLogin.ok, true);
    assert.equal(newLogin.user.id, user.id);
});
