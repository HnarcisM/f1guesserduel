const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const {
    createPostgresDatabase,
    isTransientPostgresError,
    calculateRetryDelayMs
} = require('../server/db/database');

const schemaFilePath = path.join(__dirname, '..', 'server', 'db', 'postgresSchema.sql');
const migrationsDirectoryPath = path.join(__dirname, '..', 'server', 'db', 'migrations', 'postgres');

async function successfulMigrationRunner() {
    return { appliedCount: 0, currentVersion: 1 };
}

class FakePool extends EventEmitter {
    static instances = [];

    constructor(options) {
        super();
        this.options = options;
        this.queries = [];
        this.ended = false;
        this.endCalls = 0;
        FakePool.instances.push(this);
    }

    async query(sql, params = []) {
        this.queries.push({ sql, params });
        return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    async end() {
        this.ended = true;
        this.endCalls += 1;
    }
}

test('Postgres pool uses bounded connections, timeouts and an error listener', async () => {
    FakePool.instances.length = 0;
    const errors = [];
    const migrationCalls = [];
    const logger = {
        info() {},
        error(message, metadata) {
            errors.push({ message, metadata });
        }
    };

    const database = await createPostgresDatabase({
        databaseUrl: 'postgresql://example.com/f1',
        schemaFilePath,
        ssl: true,
        maxConnections: 7,
        connectionTimeoutMs: 12_000,
        idleTimeoutMs: 34_000,
        queryTimeoutMs: 18_000,
        poolClass: FakePool,
        migrationsDirectoryPath,
        migrationRunner: async options => {
            migrationCalls.push(options);
            return { appliedCount: 1, currentVersion: 1 };
        },
        logger
    });
    const pool = FakePool.instances[0];

    assert.deepEqual(pool.options, {
        connectionString: 'postgresql://example.com/f1',
        ssl: { rejectUnauthorized: false },
        max: 7,
        connectionTimeoutMillis: 12_000,
        idleTimeoutMillis: 34_000,
        query_timeout: 18_000,
        statement_timeout: 18_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        maxLifetimeSeconds: 300,
        application_name: 'f1guesserduel'
    });
    assert.equal(migrationCalls.length, 1);
    assert.equal(migrationCalls[0].pool, pool);
    assert.equal(migrationCalls[0].migrationsDirectoryPath, migrationsDirectoryPath);
    assert.equal(migrationCalls[0].fallbackSchemaFilePath, schemaFilePath);

    const poolError = new Error('connection lost');
    pool.emit('error', poolError);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Unexpected Postgres pool error.');
    assert.equal(errors[0].metadata.error, poolError);

    await database.check();
    assert.equal(pool.queries.at(-1).sql, 'SELECT 1 AS ok');

    await database.closeConnection();
    assert.equal(pool.ended, true);
});

test('Postgres pool shutdown is idempotent', async () => {
    FakePool.instances.length = 0;
    const database = await createPostgresDatabase({
        databaseUrl: 'postgresql://example.com/f1',
        schemaFilePath,
        poolClass: FakePool,
        migrationRunner: successfulMigrationRunner,
        logger: { info() {}, error() {} }
    });
    const pool = FakePool.instances[0];

    await Promise.all([
        database.closeConnection(),
        database.closeConnection(),
        database.closeConnection()
    ]);

    assert.equal(pool.endCalls, 1);
});

test('Postgres initialization retries transient migration connection failures with backoff', async () => {
    FakePool.instances.length = 0;
    const delays = [];
    const warnings = [];
    const database = await createPostgresDatabase({
        databaseUrl: 'postgresql://example.com/f1',
        schemaFilePath,
        poolClass: FakePool,
        initializationRetryAttempts: 3,
        initializationRetryBaseDelayMs: 750,
        migrationRunner: async ({ pool }) => {
            if (FakePool.instances.indexOf(pool) === 0) {
                const error = new Error('connection reset');
                error.code = 'ECONNRESET';
                throw error;
            }
            return { appliedCount: 0, currentVersion: 1 };
        },
        sleep: async delayMs => delays.push(delayMs),
        logger: {
            info() {},
            error() {},
            warn(message, metadata) {
                warnings.push({ message, metadata });
            }
        }
    });

    assert.equal(FakePool.instances.length, 2);
    assert.equal(FakePool.instances[0].endCalls, 1);
    assert.deepEqual(delays, [750]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].metadata.errorCode, 'ECONNRESET');

    await database.closeConnection();
});

test('Postgres initialization does not retry non-transient migration errors', async () => {
    async function invalidMigrationRunner() {
            const error = new Error('syntax error');
            error.code = '42601';
            throw error;
    }

    FakePool.instances.length = 0;
    const delays = [];

    await assert.rejects(
        createPostgresDatabase({
            databaseUrl: 'postgresql://example.com/f1',
            schemaFilePath,
            poolClass: FakePool,
            migrationRunner: invalidMigrationRunner,
            initializationRetryAttempts: 3,
            sleep: async delayMs => delays.push(delayMs),
            logger: { info() {}, warn() {}, error() {} }
        }),
        /syntax error/
    );

    assert.equal(FakePool.instances.length, 1);
    assert.equal(FakePool.instances[0].endCalls, 1);
    assert.deepEqual(delays, []);
});

test('Postgres transient error detection and retry delays are bounded', () => {
    assert.equal(isTransientPostgresError({ code: '08006' }), true);
    assert.equal(isTransientPostgresError({ code: '55P03' }), true);
    assert.equal(isTransientPostgresError({ code: '57014' }), true);
    assert.equal(isTransientPostgresError({ code: '57P03' }), true);
    assert.equal(isTransientPostgresError({ code: '28P01' }), false);
    assert.equal(isTransientPostgresError({ cause: { code: 'ETIMEDOUT' } }), true);
    assert.equal(calculateRetryDelayMs(1, 1000), 1000);
    assert.equal(calculateRetryDelayMs(3, 1000), 4000);
    assert.equal(calculateRetryDelayMs(10, 1000), 30_000);
});

test('Postgres pool closes when schema initialization fails', async () => {
    FakePool.instances.length = 0;

    await assert.rejects(
        createPostgresDatabase({
            databaseUrl: 'postgresql://example.com/f1',
            schemaFilePath,
            poolClass: FakePool,
            migrationRunner: async () => {
                throw new Error('schema failed');
            },
            logger: { info() {}, error() {} }
        }),
        /schema failed/
    );

    assert.equal(FakePool.instances[0].ended, true);
});
