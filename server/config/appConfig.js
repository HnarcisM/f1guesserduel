const path = require('path');

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_COOKIE_NAME = 'f1_session';
const DEFAULT_SESSION_MAX_AGE_DAYS = 7;
const DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS = 2 * 60 * 1000;
const DEFAULT_SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_ROOM_SAVE_DEBOUNCE_MS = 250;
const DEV_SESSION_SECRET = 'f1-guesser-duel-dev-session-secret';
const DEV_SOCKET_AUTH_SECRET = 'f1-guesser-duel-dev-socket-auth-secret';
const ALLOWED_NODE_ENV_VALUES = new Set(['development', 'test', 'production']);
const ALLOWED_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

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

    return {
        nodeEnv,
        isProduction,
        port: parseIntegerEnv(env, 'PORT', DEFAULT_PORT, { min: 1, max: 65535 }),
        projectRoot,
        dataDir,
        trustProxy: parseBooleanEnv(env, 'TRUST_PROXY', false),
        driversFilePath: resolveOptionalPath(env, 'DRIVERS_FILE_PATH', path.join(projectRoot, 'data', 'drivers.json')),
        dbFilePath: resolveOptionalPath(env, 'DB_FILE_PATH', path.join(dataDir, 'f1guesser.sqlite')),
        schemaFilePath: resolveOptionalPath(env, 'DB_SCHEMA_FILE_PATH', path.join(projectRoot, 'server', 'db', 'schema.sql')),
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
    DEFAULT_PORT,
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_MAX_AGE_DAYS,
    DEFAULT_SOCKET_AUTH_TOKEN_MAX_AGE_MS,
    DEFAULT_SESSION_CLEANUP_INTERVAL_MS,
    DEFAULT_ROOM_SAVE_DEBOUNCE_MS
};
