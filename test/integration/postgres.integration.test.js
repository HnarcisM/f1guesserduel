const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { after, before, test } = require('node:test');

const { createAccountStatsRepository } = require('../../server/account/accountStatsRepository');
const { createAuthRepository } = require('../../server/auth/authRepository');
const { createPostgresDatabase } = require('../../server/db/database');
const { runPostgresMigrations } = require('../../server/db/postgresMigrator');

const databaseUrl = process.env.TEST_DATABASE_URL;
const projectRoot = path.join(__dirname, '..', '..');
const schemaFilePath = path.join(projectRoot, 'server', 'db', 'postgresSchema.sql');
const migrationsDirectoryPath = path.join(projectRoot, 'server', 'db', 'migrations', 'postgres');
const silentLogger = { info() {}, warn() {}, error() {} };

let database;
let testUserId;

before(async () => {
    assert.ok(databaseUrl, 'TEST_DATABASE_URL is required for real PostgreSQL integration tests.');
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

test('real PostgreSQL applies every migration and remains idempotent', async () => {
    assert.deepEqual(await database.check(), { ok: true });

    const migrationRows = await database.query(`
        SELECT version, name
        FROM schema_migrations
        ORDER BY version
    `);
    assert.deepEqual(
        migrationRows.rows.map(row => Number(row.version)),
        [1, 2, 3, 4, 5]
    );

    const secondRun = await runPostgresMigrations({
        pool: database.pool,
        migrationsDirectoryPath,
        fallbackSchemaFilePath: schemaFilePath,
        logger: silentLogger
    });
    assert.deepEqual(secondRun, { appliedCount: 0, currentVersion: 5 });
});

test('real PostgreSQL enforces auth constraints, sessions and account result idempotency', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const username = `ci_${suffix}`;
    const email = `ci-${suffix}@example.test`;
    const authRepository = createAuthRepository(database);

    const user = await authRepository.createUser({
        username,
        email,
        passwordHash: 'ci-password-hash'
    });
    testUserId = user.id;
    assert.equal(user.username, username);
    assert.equal(user.email, email);

    await assert.rejects(
        authRepository.createUser({
            username: `${username}_duplicate`,
            email: email.toUpperCase(),
            passwordHash: 'duplicate-hash'
        }),
        error => authRepository.isUniqueConstraintError(error)
    );

    const tokenHash = `ci-token-${suffix}`;
    await authRepository.createSession({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000)
    });
    const sessionUser = await authRepository.getSessionUserByHash(tokenHash);
    assert.equal(sessionUser.id, user.id);

    const updatedUser = await authRepository.updateAvatar(user.id, 'helmet-blue');
    assert.equal(updatedUser.avatarKey, 'helmet-blue');

    const statsRepository = createAccountStatsRepository(database);
    const gameResult = {
        userId: user.id,
        mode: 'single',
        resultKey: `ci-round-${suffix}`,
        outcome: 'win',
        attempts: 2,
        difficulty: 'hard',
        xpEarned: 60
    };
    const recorded = await statsRepository.recordGameResult(gameResult);
    const duplicate = await statsRepository.recordGameResult(gameResult);

    assert.equal(recorded.recorded, true);
    assert.equal(duplicate.recorded, false);
    assert.equal(Number(duplicate.rows[0].games_played), 1);
    assert.equal(Number(duplicate.rows[0].guess_2), 1);
    assert.equal(Number(duplicate.progressRow.total_xp), 60);
});
