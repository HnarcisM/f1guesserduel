const path = require('path');

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_COOKIE_NAME = 'f1_session';
const DEFAULT_SESSION_MAX_AGE_DAYS = 7;
const DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS = 2 * 60 * 1000;
const DEFAULT_SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_ROOM_SAVE_DEBOUNCE_MS = 250;
const DEFAULT_SOCKET_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_POSTGRES_POOL_MAX = 5;
const DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS = 15 * 1000;
const DEFAULT_POSTGRES_IDLE_TIMEOUT_MS = 30 * 1000;
const DEFAULT_POSTGRES_QUERY_TIMEOUT_MS = 20 * 1000;
const DEV_SESSION_SECRET = 'f1-guesser-duel-dev-session-secret';
const DEV_SOCKET_AUTH_SECRET = 'f1-guesser-duel-dev-socket-auth-secret';
const ALLOWED_NODE_ENV_VALUES = new Set(['development', 'test', 'production']);
const ALLOWED_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);
const ALLOWED_PERSISTENCE_MODE_VALUES = new Set(['local', 'ephemeral', 'persistent']);
const ALLOWED_DATABASE_PROVIDER_VALUES = new Set(['sqlite', 'postgres']);
const ALLOWED_LOG_LEVEL_VALUES = new Set(['silent', 'error', 'warn', 'info', 'debug']);
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DEFAULT_LOCAL_ORIGIN_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function isBlank(value) {
    return typeof value !== 'string' || value.trim().length === 0;
}

function getOptionalEnvString(env, name) {
    const value = env[name];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${name} must not be empty.`);
    }
    return value.trim();
}

function parseIntegerEnv(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const value = env[name];
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`${name} must be an integer.`);
    }

    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }

    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }

    return parsed;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
    if (typeof value !== 'string') return fallback;

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseBooleanEnv(env, name, fallback = false) {
    const value = env[name];
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') throw new Error(`${name} must be a boolean value.`);

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`${name} must be one of: true, false, 1, 0, yes, no, on, off.`);
}

function normalizeSameSite(value, fallback = 'lax') {
    if (typeof value !== 'string') return fallback;

    const normalized = value.trim().toLowerCase();
    return ALLOWED_SAME_SITE_VALUES.has(normalized) ? normalized : fallback;
}

function parseSameSiteEnv(env, name, fallback = 'lax') {
    const value = env[name];
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') throw new Error(`${name} must be a string.`);

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_SAME_SITE_VALUES.has(normalized)) {
        throw new Error(`${name} must be one of: lax, strict, none.`);
    }
    return normalized;
}

function normalizeLogLevel(value, fallback = 'info') {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') throw new Error('LOG_LEVEL must be a string.');

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_LOG_LEVEL_VALUES.has(normalized)) {
        throw new Error('LOG_LEVEL must be one of: silent, error, warn, info, debug.');
    }
    return normalized;
}

function normalizePersistenceMode(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new Error('PERSISTENCE_MODE must be a string.');

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_PERSISTENCE_MODE_VALUES.has(normalized)) {
        throw new Error('PERSISTENCE_MODE must be one of: local, ephemeral, persistent.');
    }
    return normalized;
}

function normalizeDatabaseProvider(value) {
    if (value === undefined || value === null || value === '') return 'sqlite';
    if (typeof value !== 'string') throw new Error('DATABASE_PROVIDER must be a string.');

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_DATABASE_PROVIDER_VALUES.has(normalized)) {
        throw new Error('DATABASE_PROVIDER must be one of: sqlite, postgres.');
    }
    return normalized;
}

function isEphemeralDataDirectory(dataDir) {
    if (typeof dataDir !== 'string' || dataDir.trim().length === 0) return false;

    const normalized = path.resolve(dataDir);
    return normalized === '/tmp'
        || normalized.startsWith('/tmp/')
        || normalized === '/var/tmp'
        || normalized.startsWith('/var/tmp/');
}

function resolvePersistenceMode(env, { isProduction, dataDir }) {
    const configuredMode = normalizePersistenceMode(env.PERSISTENCE_MODE);
    if (configuredMode) return configuredMode;

    if (!isProduction) return 'local';
    return isEphemeralDataDirectory(dataDir) ? 'ephemeral' : 'persistent';
}

function assertSafeProductionDatabaseConfiguration({
    isProduction,
    databaseProvider,
    persistenceMode,
    dbFilePath
}) {
    if (!isProduction || databaseProvider !== 'sqlite') return;

    const sqliteUsesEphemeralStorage = persistenceMode === 'ephemeral'
        || isEphemeralDataDirectory(path.dirname(dbFilePath));

    if (sqliteUsesEphemeralStorage) {
        throw new Error(
            'Unsafe production database configuration: SQLite cannot store accounts or sessions on ephemeral storage. '
            + 'Set DATABASE_PROVIDER=postgres with DATABASE_URL, or use a persistent disk and PERSISTENCE_MODE=persistent.'
        );
    }
}

function normalizeNodeEnv(value) {
    if (value === undefined || value === null || value === '') return 'development';
    if (typeof value !== 'string') throw new Error('NODE_ENV must be a string.');

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_NODE_ENV_VALUES.has(normalized)) {
        throw new Error('NODE_ENV must be one of: development, test, production.');
    }
    return normalized;
}

function resolveSecret({ env, primaryName, fallbackName, devFallback, isProduction }) {
    const primaryValue = getOptionalEnvString(env, primaryName);
    const fallbackValue = fallbackName ? getOptionalEnvString(env, fallbackName) : null;
    const resolved = primaryValue || fallbackValue || (!isProduction ? devFallback : null);

    if (!resolved) {
        throw new Error(`${primaryName} must be set when NODE_ENV=production.`);
    }

    return resolved;
}

function resolveOptionalPath(env, name, fallback) {
    return getOptionalEnvString(env, name) || fallback;
}


function normalizeAllowedOrigin(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error('Socket origin values must not be empty.');
    }

    let parsed;
    try {
        parsed = new URL(value.trim());
    } catch {
        throw new Error(`Invalid socket origin: ${value}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid socket origin protocol for ${value}. Use http or https.`);
    }

    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
        throw new Error(`Invalid socket origin: ${value}. Use only protocol, host and optional port.`);
    }

    return parsed.origin;
}

function splitOriginList(value) {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value !== 'string') throw new Error('SOCKET_ALLOWED_ORIGINS must be a comma-separated string.');

    return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function buildLocalOrigins(port) {
    return DEFAULT_LOCAL_ORIGIN_HOSTS.flatMap(host => [
        `http://${host}:${port}`,
        `https://${host}:${port}`
    ]);
}

function resolveSocketAllowedOrigins(env, { isProduction, port }) {
    const configuredOrigins = [
        ...splitOriginList(env.SOCKET_ALLOWED_ORIGINS),
        ...splitOriginList(env.PUBLIC_ORIGIN)
    ];

    const origins = new Set(configuredOrigins.map(normalizeAllowedOrigin));

    if (!isProduction) {
        for (const origin of buildLocalOrigins(port)) {
            origins.add(normalizeAllowedOrigin(origin));
        }
    }

    return [...origins];
}

function resolveCookieName(env) {
    const cookieName = getOptionalEnvString(env, 'SESSION_COOKIE_NAME') || DEFAULT_SESSION_COOKIE_NAME;
    if (!COOKIE_NAME_PATTERN.test(cookieName)) {
        throw new Error('SESSION_COOKIE_NAME must be a valid cookie name without spaces, semicolons or separators.');
    }
    return cookieName;
}

function createAppConfig(env = process.env, options = {}) {
    const projectRoot = options.projectRoot || path.join(__dirname, '..', '..');
    const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
    const isProduction = nodeEnv === 'production';
    const dataDir = resolveOptionalPath(env, 'DATA_DIR', path.join(projectRoot, 'data'));
    const databaseProvider = normalizeDatabaseProvider(env.DATABASE_PROVIDER);
    const databaseUrl = getOptionalEnvString(env, 'DATABASE_URL');
    if (databaseProvider === 'postgres' && !databaseUrl) {
        throw new Error('DATABASE_URL must be set when DATABASE_PROVIDER=postgres.');
    }
    const persistenceMode = resolvePersistenceMode(env, {
        isProduction,
        dataDir
    });
    const dbFilePath = resolveOptionalPath(env, 'DB_FILE_PATH', path.join(dataDir, 'f1guesser.sqlite'));
    assertSafeProductionDatabaseConfiguration({
        isProduction,
        databaseProvider,
        persistenceMode,
        dbFilePath
    });
    const sessionMaxAgeDays = parseIntegerEnv(
        env,
        'SESSION_MAX_AGE_DAYS',
        DEFAULT_SESSION_MAX_AGE_DAYS,
        { min: 1, max: 3650 }
    );

    const sessionSecret = resolveSecret({
        env,
        primaryName: 'SESSION_SECRET',
        devFallback: DEV_SESSION_SECRET,
        isProduction
    });
    const socketAuthSecret = resolveSecret({
        env,
        primaryName: 'SOCKET_AUTH_SECRET',
        fallbackName: 'SESSION_SECRET',
        devFallback: DEV_SOCKET_AUTH_SECRET,
        isProduction
    });
    const cookieSecure = parseBooleanEnv(env, 'COOKIE_SECURE', isProduction);
    const cookieSameSite = parseSameSiteEnv(env, 'COOKIE_SAMESITE', 'lax');

    if (cookieSameSite === 'none' && !cookieSecure) {
        throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true.');
    }

    const port = parseIntegerEnv(env, 'PORT', DEFAULT_PORT, { min: 1, max: 65535 });
    const socketAllowedOrigins = resolveSocketAllowedOrigins(env, {
        isProduction,
        port
    });

    return {
        nodeEnv,
        isProduction,
        port,
        projectRoot,
        dataDir,
        persistence: {
            mode: persistenceMode,
            isEphemeral: persistenceMode === 'ephemeral'
        },
        trustProxy: parseBooleanEnv(env, 'TRUST_PROXY', false),
        driversFilePath: resolveOptionalPath(env, 'DRIVERS_FILE_PATH', path.join(projectRoot, 'data', 'drivers.json')),
        dbFilePath,
        schemaFilePath: resolveOptionalPath(env, 'DB_SCHEMA_FILE_PATH', path.join(projectRoot, 'server', 'db', 'schema.sql')),
        postgresSchemaFilePath: resolveOptionalPath(env, 'POSTGRES_SCHEMA_FILE_PATH', path.join(projectRoot, 'server', 'db', 'postgresSchema.sql')),
        database: {
            provider: databaseProvider,
            url: databaseUrl,
            postgresSsl: parseBooleanEnv(env, 'POSTGRES_SSL', true),
            pool: {
                maxConnections: parseIntegerEnv(
                    env,
                    'POSTGRES_POOL_MAX',
                    DEFAULT_POSTGRES_POOL_MAX,
                    { min: 1, max: 50 }
                ),
                connectionTimeoutMs: parseIntegerEnv(
                    env,
                    'POSTGRES_CONNECTION_TIMEOUT_MS',
                    DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
                    { min: 1_000, max: 120_000 }
                ),
                idleTimeoutMs: parseIntegerEnv(
                    env,
                    'POSTGRES_IDLE_TIMEOUT_MS',
                    DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
                    { min: 1_000, max: 600_000 }
                ),
                queryTimeoutMs: parseIntegerEnv(
                    env,
                    'POSTGRES_QUERY_TIMEOUT_MS',
                    DEFAULT_POSTGRES_QUERY_TIMEOUT_MS,
                    { min: 1_000, max: 300_000 }
                )
            }
        },
        publicDir: resolveOptionalPath(env, 'PUBLIC_DIR', path.join(projectRoot, 'public')),
        rooms: {
            persistenceFilePath: resolveOptionalPath(env, 'ROOMS_FILE_PATH', path.join(dataDir, 'rooms.json')),
            saveDebounceMs: parseIntegerEnv(
                env,
                'ROOM_SAVE_DEBOUNCE_MS',
                DEFAULT_ROOM_SAVE_DEBOUNCE_MS,
                { min: 0, max: 60_000 }
            )
        },
        logging: {
            level: normalizeLogLevel(env.LOG_LEVEL, isProduction ? 'info' : 'debug'),
            requestLoggingEnabled: parseBooleanEnv(env, 'REQUEST_LOGGING_ENABLED', isProduction)
        },
        socket: {
            allowedOrigins: socketAllowedOrigins,
            rateLimit: {
                enabled: parseBooleanEnv(env, 'SOCKET_RATE_LIMIT_ENABLED', true),
                windowMs: parseIntegerEnv(
                    env,
                    'SOCKET_RATE_LIMIT_WINDOW_MS',
                    DEFAULT_SOCKET_RATE_LIMIT_WINDOW_MS,
                    { min: 1_000, max: 60 * 60 * 1000 }
                )
            }
        },
        auth: {
            sessionSecret,
            socketAuthSecret,
            sessionCookieName: resolveCookieName(env),
            sessionMaxAgeMs: sessionMaxAgeDays * 24 * 60 * 60 * 1000,
            socketAuthTokenMaxAgeMs: parseIntegerEnv(
                env,
                'SOCKET_AUTH_TOKEN_MAX_AGE_MS',
                DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS,
                { min: 1_000, max: 24 * 60 * 60 * 1000 }
            ),
            sessionCleanupIntervalMs: parseIntegerEnv(
                env,
                'SESSION_CLEANUP_INTERVAL_MS',
                DEFAULT_SESSION_CLEANUP_INTERVAL_MS,
                { min: 0, max: 24 * 60 * 60 * 1000 }
            ),
            cookie: {
                httpOnly: true,
                sameSite: cookieSameSite,
                secure: cookieSecure,
                path: '/'
            }
        }
    };
}

module.exports = {
    createAppConfig,
    parseBoolean,
    parsePositiveInteger,
    normalizeSameSite,
    normalizeAllowedOrigin,
    normalizePersistenceMode,
    normalizeLogLevel,
    normalizeDatabaseProvider,
    resolveSocketAllowedOrigins,
    DEFAULT_PORT,
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_MAX_AGE_DAYS,
    DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS,
    DEFAULT_SESSION_CLEANUP_INTERVAL_MS,
    DEFAULT_ROOM_SAVE_DEBOUNCE_MS,
    DEFAULT_SOCKET_RATE_LIMIT_WINDOW_MS,
    DEFAULT_POSTGRES_POOL_MAX,
    DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
    DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
    DEFAULT_POSTGRES_QUERY_TIMEOUT_MS
};
