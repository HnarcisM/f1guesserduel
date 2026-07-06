const DEFAULT_SOCKET_PING_INTERVAL_MS = 10_000;
const DEFAULT_SOCKET_PING_TIMEOUT_MS = 5_000;

function normalizeAllowedOrigins(allowedOrigins = []) {
    return new Set(
        Array.isArray(allowedOrigins)
            ? allowedOrigins.map(origin => String(origin).trim()).filter(Boolean)
            : []
    );
}

function isSocketOriginAllowed(origin, allowedOrigins = []) {
    if (!origin) return true;
    return normalizeAllowedOrigins(allowedOrigins).has(origin);
}

function createSocketOriginChecker(allowedOrigins = []) {
    const allowedOriginSet = normalizeAllowedOrigins(allowedOrigins);

    return function checkSocketOrigin(origin, callback) {
        if (!origin || allowedOriginSet.has(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Socket.IO origin is not allowed.'), false);
    };
}

function createSocketAllowRequest(allowedOrigins = []) {
    const allowedOriginSet = normalizeAllowedOrigins(allowedOrigins);

    return function allowSocketRequest(request, callback) {
        const origin = request?.headers?.origin;

        if (!origin || allowedOriginSet.has(origin)) {
            callback(null, true);
            return;
        }

        callback('Socket.IO origin is not allowed.', false);
    };
}

function createSocketServerOptions({ allowedOrigins = [] } = {}) {
    return {
        pingInterval: DEFAULT_SOCKET_PING_INTERVAL_MS,
        pingTimeout: DEFAULT_SOCKET_PING_TIMEOUT_MS,
        cors: {
            origin: createSocketOriginChecker(allowedOrigins),
            credentials: true,
            methods: ['GET', 'POST']
        },
        allowRequest: createSocketAllowRequest(allowedOrigins)
    };
}

module.exports = {
    createSocketServerOptions,
    createSocketOriginChecker,
    createSocketAllowRequest,
    isSocketOriginAllowed,
    normalizeAllowedOrigins,
    DEFAULT_SOCKET_PING_INTERVAL_MS,
    DEFAULT_SOCKET_PING_TIMEOUT_MS
};
