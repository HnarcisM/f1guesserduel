const crypto = require('crypto');

function getRequestPath(req) {
    const originalUrl = req.originalUrl || req.url || '';
    return String(originalUrl).split('?')[0] || '/';
}

function resolveRequestId(req) {
    const forwardedRequestId = req.headers?.['x-request-id'];
    if (Array.isArray(forwardedRequestId)) {
        return String(forwardedRequestId[0] || '').trim() || crypto.randomUUID();
    }

    return String(forwardedRequestId || '').trim() || crypto.randomUUID();
}

function createRequestLoggingMiddleware(options = {}) {
    const logger = options.logger || console;
    const enabled = options.enabled !== false;
    const clock = options.clock || (() => Date.now());

    return function requestLoggingMiddleware(req, res, next) {
        const requestId = resolveRequestId(req);
        const startedAt = clock();

        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);

        if (!enabled) {
            return next();
        }

        res.on('finish', () => {
            const durationMs = Math.max(0, clock() - startedAt);
            const statusCode = Number(res.statusCode || 0);
            const level = statusCode >= 500 ? 'error' : (statusCode >= 400 ? 'warn' : 'info');
            const logFn = typeof logger[level] === 'function' ? logger[level].bind(logger) : logger.log?.bind(logger);
            if (typeof logFn !== 'function') return;

            logFn('HTTP request completed', {
                requestId,
                method: req.method,
                path: getRequestPath(req),
                statusCode,
                durationMs,
                ip: req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown-ip'
            });
        });

        return next();
    };
}

module.exports = {
    createRequestLoggingMiddleware,
    getRequestPath,
    resolveRequestId
};
