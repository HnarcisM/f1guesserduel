const path = require('path');

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_COOKIE_NAME = 'f1_session';
const DEFAULT_SESSION_MAX_AGE_DAYS = 7;
const DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS = 2 * 60 * 1000;
const DEV_SESSION_SECRET = 'f1-guesser-duel-dev-session-secret';
const DEV_SOCKET_AUTH_SECRET = 'f1-guesser-duel-dev-socket-auth-secret';
const ALLOWED_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);

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

function normalizeSameSite(value, fallback = 'lax') {
    if (typeof value !== 'string') return fallback;

    const normalized = value.trim().toLowerCase();
    return ALLOWED_SAME_SITE_VALUES.has(normalized) ? normalized : fallback;
}

function normalizeNodeEnv(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'development';
}

function resolveSecret({ env, primaryName, fallbackName, devFallback, isProduction }) {
    const primaryValue = env[primaryName];
    const fallbackValue = fallbackName ? env[fallbackName] : null;
    const resolved = primaryValue || fallbackValue || (!isProduction ? devFallback : null);

    if (!resolved) {
        throw new Error(`${primaryName} must be set when NODE_ENV=production.`);
    }

    return resolved;
}

function createAppConfig(env = process.env, options = {}) {
    const projectRoot = options.projectRoot || path.join(__dirname, '..', '..');
    const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
    const isProduction = nodeEnv === 'production';
    const dataDir = env.DATA_DIR || path.join(projectRoot, 'data');
    const sessionMaxAgeDays = parsePositiveInteger(env.SESSION_MAX_AGE_DAYS, DEFAULT_SESSION_MAX_AGE_DAYS);

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

    return {
        nodeEnv,
        isProduction,
        port: parsePositiveInteger(env.PORT, DEFAULT_PORT),
        projectRoot,
        dataDir,
        trustProxy: parseBoolean(env.TRUST_PROXY, false),
        driversFilePath: env.DRIVERS_FILE_PATH || path.join(projectRoot, 'drivers.json'),
        dbFilePath: env.DB_FILE_PATH || path.join(dataDir, 'f1guesser.sqlite'),
        schemaFilePath: env.DB_SCHEMA_FILE_PATH || path.join(projectRoot, 'server', 'db', 'schema.sql'),
        publicDir: env.PUBLIC_DIR || path.join(projectRoot, 'public'),
        auth: {
            sessionSecret,
            socketAuthSecret,
            sessionCookieName: env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME,
            sessionMaxAgeMs: sessionMaxAgeDays * 24 * 60 * 60 * 1000,
            socketAuthTokenMaxAgeMs: parsePositiveInteger(
                env.SOCKET_AUTH_TOKEN_MAX_AGE_MS,
                DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS
            ),
            cookie: {
                httpOnly: true,
                sameSite: normalizeSameSite(env.COOKIE_SAMESITE, 'lax'),
                secure: parseBoolean(env.COOKIE_SECURE, isProduction),
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
    DEFAULT_PORT,
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_MAX_AGE_DAYS,
    DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS
};
