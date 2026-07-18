const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const { createPostgresDatabase } = require('../server/db/database');

const schemaFilePath = path.join(__dirname, '..', 'server', 'db', 'postgresSchema.sql');

class FakePool extends EventEmitter {
    static instances = [];

    constructor(options) {
        super();
        this.options = options;
        this.queries = [];
        this.ended = false;
        FakePool.instances.push(this);
    }

    async query(sql, params = []) {
        this.queries.push({ sql, params });
        return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    async end() {
        this.ended = true;
    }
}

test('Postgres pool uses bounded connections, timeouts and an error listener', async () => {
    FakePool.instances.length = 0;
    const errors = [];
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
        application_name: 'f1guesserduel'
    });
    assert.match(pool.queries[0].sql, /CREATE TABLE IF NOT EXISTS users/);

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

test('Postgres pool closes when schema initialization fails', async () => {
    class FailingPool extends FakePool {
        async query() {
            throw new Error('schema failed');
        }
    }

    FakePool.instances.length = 0;

    await assert.rejects(
        createPostgresDatabase({
            databaseUrl: 'postgresql://example.com/f1',
            schemaFilePath,
            poolClass: FailingPool,
            logger: { info() {}, error() {} }
        }),
        /schema failed/
    );

    assert.equal(FakePool.instances[0].ended, true);
});
