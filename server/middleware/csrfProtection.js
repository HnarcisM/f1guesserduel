const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getRequestHeader(req, name) {
    const value = typeof req?.get === 'function'
        ? req.get(name)
        : req?.headers?.[String(name).toLowerCase()];

    return typeof value === 'string' ? value.trim() : '';
}

function parseHttpUrl(value) {
    if (!value) return null;

    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
    } catch {
        return null;
    }
}

function normalizeConfiguredOrigin(value) {
    const parsed = parseHttpUrl(typeof value === 'string' ? value.trim() : '');
    if (
        !parsed
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash
    ) {
        throw new Error(`Invalid CSRF allowed origin: ${value}`);
    }

    return parsed.origin;
}

function getRequestSourceOrigin(req) {
    const originHeader = getRequestHeader(req, 'origin');
    if (originHeader) {
        const parsedOrigin = parseHttpUrl(originHeader);
        if (
            !parsedOrigin
            || parsedOrigin.username
            || parsedOrigin.password
            || parsedOrigin.pathname !== '/'
            || parsedOrigin.search
            || parsedOrigin.hash
        ) {
            return null;
        }
        return parsedOrigin.origin;
    }

    const refererHeader = getRequestHeader(req, 'referer');
    return parseHttpUrl(refererHeader)?.origin || null;
}

function rejectCsrfRequest(res) {
    res.set('Cache-Control', 'no-store');
    return res.status(403).json({
        message: 'Cererea a fost blocată de protecția CSRF. Reîncarcă pagina și încearcă din nou.'
    });
}

function createCsrfProtectionMiddleware({ allowedOrigins = [] } = {}) {
    const allowedOriginSet = new Set(
        (Array.isArray(allowedOrigins) ? allowedOrigins : [])
            .map(normalizeConfiguredOrigin)
    );

    return function csrfProtection(req, res, next) {
        const method = String(req?.method || '').toUpperCase();
        if (SAFE_HTTP_METHODS.has(method)) return next();

        const fetchSite = getRequestHeader(req, 'sec-fetch-site').toLowerCase();
        if (fetchSite === 'cross-site') return rejectCsrfRequest(res);

        const sourceOrigin = getRequestSourceOrigin(req);
        if (!sourceOrigin || !allowedOriginSet.has(sourceOrigin)) {
            return rejectCsrfRequest(res);
        }

        return next();
    };
}

module.exports = {
    SAFE_HTTP_METHODS,
    createCsrfProtectionMiddleware,
    getRequestHeader,
    getRequestSourceOrigin,
    normalizeConfiguredOrigin
};
