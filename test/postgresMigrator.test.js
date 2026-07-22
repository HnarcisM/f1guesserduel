const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    POSTGRES_MIGRATION_LOCK_KEYS,
    loadPostgresMigrations,
    validateAppliedMigrations,
    runPostgresMigrations
} = require('../server/db/postgresMigrator');

const migrationsDirectoryPath = path.join(__dirname, '..', 'server', 'db', 'migrations', 'postgres');
const fallbackSchemaFilePath = path.join(__dirname, '..', 'server', 'db', 'postgresSchema.sql');

class FakeMigrationClient {
    constructor({ appliedRows = [], failOnSql = null } = {}) {
        this.appliedRows = appliedRows.map(row => ({ ...row }));
        this.failOnSql = failOnSql;
        this.queries = [];
        this.releaseCalls = 0;
    }

    async query(sql, params = []) {
        const normalizedSql = sql.trim();
        this.queries.push({ sql: normalizedSql, params });

        if (this.failOnSql && normalizedSql.includes(this.failOnSql)) {
            throw new Error('migration execution failed');
        }
        if (normalizedSql.startsWith('SELECT version, name, checksum')) {
            return { rows: this.appliedRows.map(row => ({ ...row })) };
        }
        if (normalizedSql.startsWith('INSERT INTO schema_migrations')) {
            this.appliedRows.push({
                version: params[0],
                name: params[1],
                checksum: params[2]
            });
            return { rowCount: 1, rows: [] };
        }

        return { rowCount: 0, rows: [] };
    }

    release() {
        this.releaseCalls += 1;
    }
}

function createFakePool(client) {
    return {
        connectCalls: 0,
        async connect() {
            this.connectCalls += 1;
            return client;
        }
    };
}

test('migration loader reads numbered files and keeps the legacy fallback checksum compatible', () => {
    const migrations = loadPostgresMigrations({ migrationsDirectoryPath });
    const missingDirectoryPath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'f1-migrations-fallback-')),
        'missing'
    );
    const fallbackMigrations = loadPostgresMigrations({
        migrationsDirectoryPath: missingDirectoryPath,
        fallbackSchemaFilePath
    });

    assert.equal(migrations.length, 6);
    assert.equal(migrations[0].version, 1);
    assert.equal(migrations[0].name, 'initial_auth_schema');
    assert.equal(migrations[0].checksum, fallbackMigrations[0].checksum);
});

test('migration runner applies pending migrations transactionally under an advisory lock', async () => {
    const client = new FakeMigrationClient();
    const pool = createFakePool(client);
    const logs = [];

    const result = await runPostgresMigrations({
        pool,
        migrationsDirectoryPath,
        fallbackSchemaFilePath,
        logger: {
            info(message, metadata) {
                logs.push({ message, metadata });
            },
            error() {}
        }
    });

    assert.deepEqual(result, { appliedCount: 6, currentVersion: 6 });
    assert.equal(pool.connectCalls, 1);
    assert.equal(client.queries[0].sql, 'BEGIN');
    assert.deepEqual(client.queries[1], {
        sql: 'SELECT pg_advisory_xact_lock($1, $2)',
        params: POSTGRES_MIGRATION_LOCK_KEYS
    });
    assert.match(client.queries[2].sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
    assert.match(client.queries[4].sql, /CREATE TABLE IF NOT EXISTS users/);
    assert.match(client.queries[5].sql, /INSERT INTO schema_migrations/);
    assert.equal(client.queries.at(-1).sql, 'COMMIT');
    assert.equal(client.releaseCalls, 1);
    assert.equal(logs.length, 6);
    assert.equal(logs[0].metadata.version, 1);
    assert.equal(logs[1].metadata.version, 2);
    assert.equal(logs[2].metadata.version, 3);
    assert.equal(logs[2].metadata.name, 'account_progress');
    assert.equal(logs[3].metadata.version, 4);
    assert.equal(logs[3].metadata.name, 'profile_avatars');
    assert.equal(logs[4].metadata.version, 5);
    assert.equal(logs[4].metadata.name, 'username_change_cooldown');
    assert.equal(logs[5].metadata.version, 6);
    assert.equal(logs[5].metadata.name, 'daily_attempts');
});

test('migration runner skips migrations that were already applied with the same checksum', async () => {
    const migrations = loadPostgresMigrations({ migrationsDirectoryPath });
    const client = new FakeMigrationClient({
        appliedRows: migrations.map(migration => ({
            version: migration.version,
            name: migration.name,
            checksum: migration.checksum
        }))
    });

    const result = await runPostgresMigrations({
        pool: createFakePool(client),
        migrationsDirectoryPath,
        logger: { info() {}, error() {} }
    });

    assert.deepEqual(result, { appliedCount: 0, currentVersion: 6 });
    assert.equal(
        client.queries.some(query => query.sql.startsWith('INSERT INTO schema_migrations')),
        false
    );
    assert.equal(client.queries.at(-1).sql, 'COMMIT');
    assert.equal(client.releaseCalls, 1);
});

test('migration runner rejects edited applied migrations and rolls back', async () => {
    const client = new FakeMigrationClient({
        appliedRows: [{
            version: 1,
            name: 'initial_auth_schema',
            checksum: '0'.repeat(64)
        }]
    });

    await assert.rejects(
        runPostgresMigrations({
            pool: createFakePool(client),
            migrationsDirectoryPath,
            logger: { info() {}, error() {} }
        }),
        /checksum mismatch/
    );

    assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(client.releaseCalls, 1);
});

test('migration runner rolls back a failed SQL migration without recording it', async () => {
    const client = new FakeMigrationClient({ failOnSql: 'CREATE TABLE IF NOT EXISTS users' });

    await assert.rejects(
        runPostgresMigrations({
            pool: createFakePool(client),
            migrationsDirectoryPath,
            logger: { info() {}, error() {} }
        }),
        /migration execution failed/
    );

    assert.equal(
        client.queries.some(query => query.sql.startsWith('INSERT INTO schema_migrations')),
        false
    );
    assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(client.releaseCalls, 1);
});

test('migration validation rejects database versions missing from the application', () => {
    const migrations = loadPostgresMigrations({ migrationsDirectoryPath });

    assert.throws(
        () => validateAppliedMigrations([{
            version: 7,
            name: 'future_migration',
            checksum: 'a'.repeat(64)
        }], migrations),
        /missing from this application version/
    );
});

test('migration loader rejects duplicate version numbers', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-migrations-'));
    fs.writeFileSync(path.join(tempDirectory, '001_first.sql'), 'SELECT 1;\n', 'utf8');
    fs.writeFileSync(path.join(tempDirectory, '001_duplicate.sql'), 'SELECT 2;\n', 'utf8');

    assert.throws(
        () => loadPostgresMigrations({ migrationsDirectoryPath: tempDirectory }),
        /Duplicate Postgres migration version/
    );
});
