const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { after, before, test } = require('node:test');

const { createPostgresDatabase } = require('../../server/db/database');
const {
    RESTORE_CONFIRMATION,
    createBackup,
    restoreBackup,
    verifyBackup
} = require('../../scripts/postgresBackupRestore');

const databaseUrl = process.env.TEST_DATABASE_URL;
const dockerImage = process.env.TEST_POSTGRES_TOOLS_DOCKER_IMAGE
    || process.env.POSTGRES_TOOLS_DOCKER_IMAGE
    || '';
const dockerNetwork = process.env.TEST_POSTGRES_TOOLS_DOCKER_NETWORK
    || process.env.POSTGRES_TOOLS_DOCKER_NETWORK
    || 'host';
const projectRoot = path.join(__dirname, '..', '..');
const schemaFilePath = path.join(projectRoot, 'server', 'db', 'postgresSchema.sql');
const migrationsDirectoryPath = path.join(projectRoot, 'server', 'db', 'migrations', 'postgres');
const silentLogger = { info() {}, warn() {}, error() {} };

let database;
let adminClient;
let sourceProbeSchema;
let targetDatabaseName;
let temporaryDirectory;

function quoteIdentifier(identifier) {
    return `"${String(identifier).replaceAll('"', '""')}"`;
}

function replaceDatabaseName(connectionString, databaseName) {
    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    return url.toString();
}

async function dropTargetDatabase() {
    if (!adminClient || !targetDatabaseName) return;
    await adminClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
    `, [targetDatabaseName]);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDatabaseName)}`);
}

before(async () => {
    assert.ok(databaseUrl, 'TEST_DATABASE_URL is required for PostgreSQL backup/restore integration tests.');
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

    adminClient = new Client({
        connectionString: replaceDatabaseName(databaseUrl, 'postgres'),
        ssl: false
    });
    await adminClient.connect();
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-pg-restore-'));
});

after(async () => {
    try {
        await dropTargetDatabase();
        if (database && sourceProbeSchema) {
            await database.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(sourceProbeSchema)} CASCADE`);
        }
    } finally {
        await adminClient?.end();
        await database?.closeConnection();
        if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});

test('a PostgreSQL custom backup is verified and restored into a separate database', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toLowerCase();
    sourceProbeSchema = `backup_probe_${suffix}`;
    targetDatabaseName = `f1_restore_${suffix}`;
    const marker = `restored-${suffix}`;

    await database.query(`CREATE SCHEMA ${quoteIdentifier(sourceProbeSchema)}`);
    await database.query(`
        CREATE TABLE ${quoteIdentifier(sourceProbeSchema)}.restore_probe (
            id integer PRIMARY KEY,
            marker text NOT NULL
        )
    `);
    await database.query(
        `INSERT INTO ${quoteIdentifier(sourceProbeSchema)}.restore_probe (id, marker) VALUES ($1, $2)`,
        [1, marker]
    );

    const backupFile = path.join(temporaryDirectory, `f1guesser-${suffix}.dump`);
    const backup = await createBackup({
        databaseUrl,
        outputFile: backupFile,
        dockerImage,
        dockerNetwork
    });
    const verification = await verifyBackup({
        backupFile,
        databaseUrl,
        dockerImage,
        dockerNetwork
    });
    assert.equal(verification.metadata.sha256, backup.metadata.sha256);
    assert.ok(verification.tocEntries > 0);

    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(targetDatabaseName)}`);
    const targetDatabaseUrl = replaceDatabaseName(databaseUrl, targetDatabaseName);
    await restoreBackup({
        databaseUrl: targetDatabaseUrl,
        backupFile,
        confirmation: RESTORE_CONFIRMATION,
        dockerImage,
        dockerNetwork
    });

    const targetClient = new Client({ connectionString: targetDatabaseUrl, ssl: false });
    await targetClient.connect();
    try {
        const restoredProbe = await targetClient.query(
            `SELECT marker FROM ${quoteIdentifier(sourceProbeSchema)}.restore_probe WHERE id = $1`,
            [1]
        );
        assert.equal(restoredProbe.rows[0]?.marker, marker);

        const migrations = await targetClient.query('SELECT COUNT(*)::integer AS count FROM schema_migrations');
        assert.ok(Number(migrations.rows[0]?.count) >= 1);
    } finally {
        await targetClient.end();
    }
});
