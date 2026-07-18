const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const POSTGRES_MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9][a-z0-9_-]*)\.sql$/;
const POSTGRES_MIGRATION_LOCK_KEYS = [7041, 2026];
const CREATE_MIGRATIONS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        name TEXT NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
`;
const SELECT_APPLIED_MIGRATIONS_SQL = `
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version ASC
`;

function calculateMigrationChecksum(sql) {
    const normalizedSql = sql.replace(/\r\n?/g, '\n');
    return crypto.createHash('sha256').update(normalizedSql, 'utf8').digest('hex');
}

function createMigration({ version, name, filePath, sql }) {
    if (!Number.isSafeInteger(version) || version <= 0) {
        throw new Error(`Invalid Postgres migration version in ${filePath}.`);
    }
    if (!sql.trim()) {
        throw new Error(`Postgres migration ${path.basename(filePath)} must not be empty.`);
    }

    return {
        version,
        name,
        filePath,
        sql,
        checksum: calculateMigrationChecksum(sql)
    };
}

function loadMigrationFile(filePath) {
    const fileName = path.basename(filePath);
    const match = POSTGRES_MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match) {
        throw new Error(
            `Invalid Postgres migration filename: ${fileName}. Use NNN_descriptive_name.sql.`
        );
    }

    return createMigration({
        version: Number(match[1]),
        name: match[2],
        filePath,
        sql: fs.readFileSync(filePath, 'utf8')
    });
}

function assertUniqueMigrationVersions(migrations) {
    const versions = new Set();

    for (const migration of migrations) {
        if (versions.has(migration.version)) {
            throw new Error(`Duplicate Postgres migration version: ${migration.version}.`);
        }
        versions.add(migration.version);
    }
}

function loadPostgresMigrations({ migrationsDirectoryPath, fallbackSchemaFilePath } = {}) {
    let migrationFilePaths = [];

    if (migrationsDirectoryPath && fs.existsSync(migrationsDirectoryPath)) {
        migrationFilePaths = fs.readdirSync(migrationsDirectoryPath, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
            .map(entry => path.join(migrationsDirectoryPath, entry.name));
    }

    let migrations = migrationFilePaths.map(loadMigrationFile);
    if (migrations.length === 0 && fallbackSchemaFilePath && fs.existsSync(fallbackSchemaFilePath)) {
        migrations = [createMigration({
            version: 1,
            name: 'initial_auth_schema',
            filePath: fallbackSchemaFilePath,
            sql: fs.readFileSync(fallbackSchemaFilePath, 'utf8')
        })];
    }

    if (migrations.length === 0) {
        throw new Error('No Postgres migration files were found.');
    }

    migrations.sort((left, right) => left.version - right.version);
    assertUniqueMigrationVersions(migrations);
    return migrations;
}

function validateAppliedMigrations(appliedRows, localMigrations) {
    const localByVersion = new Map(localMigrations.map(migration => [migration.version, migration]));

    for (const [index, row] of appliedRows.entries()) {
        const version = Number(row.version);
        const localMigration = localByVersion.get(version);
        if (!localMigration) {
            throw new Error(
                `Database contains Postgres migration ${version}, but it is missing from this application version.`
            );
        }
        if (localMigrations[index]?.version !== version) {
            throw new Error('Applied Postgres migrations must match the local migration order.');
        }
        if (row.name !== localMigration.name) {
            throw new Error(`Postgres migration ${version} name does not match the applied migration.`);
        }
        if (row.checksum !== localMigration.checksum) {
            throw new Error(
                `Postgres migration ${version} checksum mismatch. Applied migration files must not be edited.`
            );
        }
    }
}

async function rollbackMigrationTransaction(client, logger) {
    try {
        await client.query('ROLLBACK');
    } catch (error) {
        logger?.error?.('Failed to roll back Postgres migrations.', {
            error,
            databaseProvider: 'postgres'
        });
    }
}

async function runPostgresMigrations({
    pool,
    migrationsDirectoryPath,
    fallbackSchemaFilePath,
    logger = console
}) {
    if (!pool || typeof pool.connect !== 'function') {
        throw new Error('A Postgres pool with connect() is required to run migrations.');
    }

    const migrations = loadPostgresMigrations({
        migrationsDirectoryPath,
        fallbackSchemaFilePath
    });
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query(
            'SELECT pg_advisory_xact_lock($1, $2)',
            POSTGRES_MIGRATION_LOCK_KEYS
        );
        await client.query(CREATE_MIGRATIONS_TABLE_SQL);

        const appliedResult = await client.query(SELECT_APPLIED_MIGRATIONS_SQL);
        const appliedRows = Array.isArray(appliedResult.rows) ? appliedResult.rows : [];
        validateAppliedMigrations(appliedRows, migrations);

        const appliedVersions = new Set(appliedRows.map(row => Number(row.version)));
        const pendingMigrations = migrations.filter(migration => !appliedVersions.has(migration.version));

        for (const migration of pendingMigrations) {
            await client.query(migration.sql);
            await client.query(
                `INSERT INTO schema_migrations (version, name, checksum)
                 VALUES ($1, $2, $3)`,
                [migration.version, migration.name, migration.checksum]
            );
        }

        await client.query('COMMIT');
        transactionStarted = false;

        for (const migration of pendingMigrations) {
            logger?.info?.('Postgres migration applied.', {
                version: migration.version,
                name: migration.name,
                databaseProvider: 'postgres'
            });
        }
        return {
            appliedCount: pendingMigrations.length,
            currentVersion: migrations.at(-1).version
        };
    } catch (error) {
        if (transactionStarted) {
            await rollbackMigrationTransaction(client, logger);
        }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    POSTGRES_MIGRATION_FILE_PATTERN,
    POSTGRES_MIGRATION_LOCK_KEYS,
    calculateMigrationChecksum,
    loadPostgresMigrations,
    validateAppliedMigrations,
    runPostgresMigrations
};
