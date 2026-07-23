const fs = require('fs');
const path = require('path');
const { runPostgresMigrations } = require('./postgresMigrator');
const { ensureSqliteAccountGameHistoryColumns } = require('./sqliteSchemaUpgrade');

const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENETDOWN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    '53300',
    '53400',
    '55P03',
    '57014',
    '57P01',
    '57P02',
    '57P03',
    '58030'
]);
const POSTGRES_INIT_RETRY_MAX_DELAY_MS = 30_000;

function isTransientPostgresError(error) {
    let currentError = error;

    for (let depth = 0; currentError && depth < 5; depth += 1) {
        const code = typeof currentError.code === 'string'
            ? currentError.code.toUpperCase()
            : '';
        if (code.startsWith('08') || TRANSIENT_POSTGRES_ERROR_CODES.has(code)) {
            return true;
        }

        currentError = currentError.cause;
    }

    return false;
}

function calculateRetryDelayMs(attempt, baseDelayMs) {
    return Math.min(
        baseDelayMs * (2 ** Math.max(0, attempt - 1)),
        POSTGRES_INIT_RETRY_MAX_DELAY_MS
    );
}

function wait(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

const METRICS_INSTRUMENTED = Symbol('metricsInstrumented');

function instrumentPostgresQueryable(queryable, metrics) {
    if (!queryable || typeof queryable.query !== 'function' || !metrics?.observeDependencyOperation) {
        return queryable;
    }
    if (queryable[METRICS_INSTRUMENTED]) return queryable;

    const query = queryable.query.bind(queryable);
    Object.defineProperty(queryable, METRICS_INSTRUMENTED, { value: true });
    queryable.query = (...args) => metrics.observeDependencyOperation(
        'postgres',
        'query',
        () => query(...args)
    );
    return queryable;
}

function instrumentPostgresPool(pool, metrics) {
    if (!pool || !metrics?.observeDependencyOperation) return pool;

    return new Proxy(pool, {
        get(target, property) {
            if (property === 'query') {
                return (...args) => metrics.observeDependencyOperation(
                    'postgres',
                    'query',
                    () => target.query(...args)
                );
            }

            if (property === 'connect') {
                return (...args) => {
                    if (args.some(argument => typeof argument === 'function')) {
                        return target.connect(...args);
                    }
                    return metrics.observeDependencyOperation(
                        'postgres',
                        'connect',
                        async () => instrumentPostgresQueryable(await target.connect(...args), metrics)
                    );
                };
            }

            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

async function closePostgresPool(pool, logger, contextMessage) {
    try {
        await pool.end();
    } catch (error) {
        logger?.error?.(contextMessage, {
            error,
            databaseProvider: 'postgres'
        });
    }
}

function createSqliteDatabase({ dbFilePath, schemaFilePath }) {
    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (error) {
        throw new Error(
            "Lipsește dependența 'better-sqlite3'. Rulează `npm install` înainte de `npm start`."
        );
    }

    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

    const db = new Database(dbFilePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(schemaFilePath, 'utf8');
    db.exec(schema);
    ensureSqliteAccountGameHistoryColumns(db);

    db.provider = 'sqlite';
    db.check = () => {
        db.prepare('SELECT 1 AS ok').get();
        return { ok: true };
    };
    db.closeConnection = () => db.close?.();

    return db;
}

async function createPostgresDatabase({
    databaseUrl,
    schemaFilePath,
    migrationsDirectoryPath,
    ssl = true,
    maxConnections = 5,
    connectionTimeoutMs = 15_000,
    idleTimeoutMs = 30_000,
    queryTimeoutMs = 20_000,
    initializationRetryAttempts = 3,
    initializationRetryBaseDelayMs = 1000,
    keepAliveInitialDelayMs = 10_000,
    maxLifetimeSeconds = 300,
    poolClass = null,
    migrationRunner = runPostgresMigrations,
    logger = console,
    sleep = wait,
    metrics = null
}) {
    if (!databaseUrl || typeof databaseUrl !== 'string') {
        throw new Error('DATABASE_URL must be set when DATABASE_PROVIDER=postgres.');
    }

    let PostgresPool = poolClass;
    if (!PostgresPool) {
        try {
            ({ Pool: PostgresPool } = require('pg'));
        } catch (error) {
            throw new Error(
                "Lipsește dependența 'pg'. Rulează `npm install` înainte de `npm start`."
            );
        }
    }

    let pool;
    let initializationAttempt = 0;
    let migrationResult = null;

    while (initializationAttempt < initializationRetryAttempts) {
        initializationAttempt += 1;
        pool = new PostgresPool({
            connectionString: databaseUrl,
            ssl: ssl ? { rejectUnauthorized: false } : false,
            max: maxConnections,
            connectionTimeoutMillis: connectionTimeoutMs,
            idleTimeoutMillis: idleTimeoutMs,
            query_timeout: queryTimeoutMs,
            statement_timeout: queryTimeoutMs,
            keepAlive: true,
            keepAliveInitialDelayMillis: keepAliveInitialDelayMs,
            maxLifetimeSeconds,
            application_name: 'f1guesserduel'
        });

        pool.on?.('error', error => {
            metrics?.recordDependencyOperation?.({
                dependency: 'postgres',
                operation: 'pool_event',
                outcome: 'error'
            });
            logger?.error?.('Unexpected Postgres pool error.', {
                error,
                databaseProvider: 'postgres'
            });
        });

        try {
            const runMigrations = () => migrationRunner({
                pool,
                migrationsDirectoryPath,
                fallbackSchemaFilePath: schemaFilePath,
                logger
            });
            migrationResult = metrics?.observeDependencyOperation
                ? await metrics.observeDependencyOperation('postgres', 'migrate', runMigrations)
                : await runMigrations();
            break;
        } catch (error) {
            await closePostgresPool(
                pool,
                logger,
                'Failed to close Postgres pool after initialization error.'
            );

            const shouldRetry = initializationAttempt < initializationRetryAttempts
                && isTransientPostgresError(error);
            if (!shouldRetry) throw error;

            const retryDelayMs = calculateRetryDelayMs(
                initializationAttempt,
                initializationRetryBaseDelayMs
            );
            logger?.warn?.('Postgres initialization failed temporarily; retrying.', {
                attempt: initializationAttempt,
                maxAttempts: initializationRetryAttempts,
                retryDelayMs,
                errorCode: typeof error.code === 'string' ? error.code : null,
                databaseProvider: 'postgres'
            });
            await sleep(retryDelayMs);
        }
    }

    logger?.info?.('Postgres database initialized.', {
        databaseProvider: 'postgres',
        initializationAttempts: initializationAttempt,
        migrationVersion: migrationResult?.currentVersion || null,
        appliedMigrations: migrationResult?.appliedCount || 0
    });

    const instrumentedPool = instrumentPostgresPool(pool, metrics);

    let closePromise = null;
    function closeConnection() {
        if (!closePromise) {
            const closePool = () => Promise.resolve().then(() => pool.end());
            closePromise = metrics?.observeDependencyOperation
                ? metrics.observeDependencyOperation('postgres', 'shutdown', closePool)
                : closePool();
        }
        return closePromise;
    }

    return {
        provider: 'postgres',
        pool: instrumentedPool,
        async query(sql, params = []) {
            return instrumentedPool.query(sql, params);
        },
        async check() {
            const runHealthCheck = () => instrumentedPool.query('SELECT 1 AS ok');
            if (metrics?.observeDependencyOperation) {
                await metrics.observeDependencyOperation('postgres', 'health_check', runHealthCheck);
            } else {
                await runHealthCheck();
            }
            return { ok: true };
        },
        closeConnection
    };
}

async function createDatabase(options = {}) {
    const provider = options.provider || options.databaseProvider || 'sqlite';

    if (provider === 'postgres') {
        return createPostgresDatabase({
            databaseUrl: options.databaseUrl,
            schemaFilePath: options.postgresSchemaFilePath || options.schemaFilePath,
            migrationsDirectoryPath: options.postgresMigrationsDirPath || options.migrationsDirectoryPath,
            ssl: options.postgresSsl ?? true,
            maxConnections: options.maxConnections,
            connectionTimeoutMs: options.connectionTimeoutMs,
            idleTimeoutMs: options.idleTimeoutMs,
            queryTimeoutMs: options.queryTimeoutMs,
            initializationRetryAttempts: options.initializationRetryAttempts,
            initializationRetryBaseDelayMs: options.initializationRetryBaseDelayMs,
            keepAliveInitialDelayMs: options.keepAliveInitialDelayMs,
            maxLifetimeSeconds: options.maxLifetimeSeconds,
            poolClass: options.poolClass,
            migrationRunner: options.migrationRunner,
            logger: options.logger,
            sleep: options.sleep,
            metrics: options.metrics
        });
    }

    if (provider !== 'sqlite') {
        throw new Error(`Unsupported database provider: ${provider}`);
    }

    return createSqliteDatabase(options);
}

module.exports = {
    createDatabase,
    createSqliteDatabase,
    createPostgresDatabase,
    instrumentPostgresPool,
    isTransientPostgresError,
    calculateRetryDelayMs
};
