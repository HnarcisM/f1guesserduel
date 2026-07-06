const LOG_LEVELS = Object.freeze({
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
});

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|passwd|pwd|secret|session|token|csrf|api[-_]?key)/i;
const MAX_STRING_LENGTH = 1000;
const MAX_DEPTH = 4;

function normalizeLogLevel(value, fallback = 'info') {
    if (typeof value !== 'string' || value.trim().length === 0) return fallback;

    const normalized = value.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(LOG_LEVELS, normalized)
        ? normalized
        : fallback;
}

function shouldLog(currentLevel, messageLevel) {
    return LOG_LEVELS[normalizeLogLevel(currentLevel, 'info')] >= LOG_LEVELS[messageLevel];
}

function truncateString(value) {
    if (value.length <= MAX_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
}

function serializeError(error, depth = 0) {
    if (!error || typeof error !== 'object') {
        return { message: String(error) };
    }

    const serialized = {
        name: error.name || 'Error',
        message: truncateString(error.message || String(error))
    };

    if (error.code) serialized.code = String(error.code);
    if (error.status || error.statusCode) serialized.statusCode = Number(error.status || error.statusCode);
    if (error.stack) serialized.stack = truncateString(String(error.stack));
    if (error.cause && depth < MAX_DEPTH) serialized.cause = serializeError(error.cause, depth + 1);

    return serialized;
}

function sanitizeLogValue(value, key = '', depth = 0, seen = new WeakSet()) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
        return '[REDACTED]';
    }

    if (value instanceof Error) {
        return serializeError(value, depth);
    }

    if (value === null || value === undefined) return value;

    if (typeof value === 'string') return truncateString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function') return '[Function]';
    if (typeof value !== 'object') return String(value);

    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_DEPTH) return '[MaxDepth]';

    seen.add(value);

    if (Array.isArray(value)) {
        return value.slice(0, 50).map(item => sanitizeLogValue(item, key, depth + 1, seen));
    }

    const sanitized = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
        sanitized[entryKey] = sanitizeLogValue(entryValue, entryKey, depth + 1, seen);
    }

    return sanitized;
}

function sanitizeLogMeta(meta = {}) {
    if (!meta || typeof meta !== 'object') return {};
    return sanitizeLogValue(meta);
}

function createLogger(options = {}) {
    const level = normalizeLogLevel(options.level, options.isProduction ? 'info' : 'debug');
    const isProduction = options.isProduction === true;
    const destination = options.destination || console;
    const clock = options.clock || (() => new Date());

    function write(messageLevel, message, meta = undefined) {
        if (!shouldLog(level, messageLevel)) return;

        const normalizedMessage = typeof message === 'string'
            ? message
            : JSON.stringify(sanitizeLogValue(message));
        const sanitizedMeta = sanitizeLogMeta(meta);
        const outputMethod = messageLevel === 'error'
            ? 'error'
            : (messageLevel === 'warn' ? 'warn' : 'log');
        const writer = typeof destination[outputMethod] === 'function'
            ? destination[outputMethod].bind(destination)
            : destination.log?.bind(destination);

        if (typeof writer !== 'function') return;

        if (isProduction) {
            writer(JSON.stringify({
                time: clock().toISOString(),
                level: messageLevel,
                message: normalizedMessage,
                ...sanitizedMeta
            }));
            return;
        }

        if (Object.keys(sanitizedMeta).length > 0) {
            writer(`[${messageLevel}] ${normalizedMessage}`, sanitizedMeta);
            return;
        }

        writer(`[${messageLevel}] ${normalizedMessage}`);
    }

    return {
        level,
        debug: (message, meta) => write('debug', message, meta),
        info: (message, meta) => write('info', message, meta),
        warn: (message, meta) => write('warn', message, meta),
        error: (message, meta) => write('error', message, meta)
    };
}

module.exports = {
    createLogger,
    normalizeLogLevel,
    sanitizeLogMeta,
    sanitizeLogValue,
    serializeError,
    LOG_LEVELS
};
