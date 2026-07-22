const crypto = require('crypto');
const express = require('express');

function extractBearerToken(authorizationHeader) {
    if (typeof authorizationHeader !== 'string') return null;
    const match = authorizationHeader.match(/^Bearer ([^\s]+)$/);
    return match ? match[1] : null;
}

function tokensMatch(providedToken, expectedToken) {
    if (!providedToken || !expectedToken) return false;
    const provided = Buffer.from(providedToken, 'utf8');
    const expected = Buffer.from(expectedToken, 'utf8');
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function createMetricsHandler({ enabled = false, token = null, operationalMetrics = null } = {}) {
    return async function metricsHandler(req, res, next) {
        res.set('Cache-Control', 'no-store');
        if (!enabled || !operationalMetrics?.enabled) {
            return res.sendStatus(404);
        }

        const providedToken = extractBearerToken(req.get('authorization'));
        if (!tokensMatch(providedToken, token)) {
            res.set('WWW-Authenticate', 'Bearer realm="metrics"');
            return res.status(401).json({ message: 'Unauthorized.' });
        }

        try {
            res.type(operationalMetrics.contentType);
            return res.send(await operationalMetrics.metrics());
        } catch (error) {
            return next(error);
        }
    };
}

function createMetricsRoutes(options = {}) {
    const router = express.Router();
    router.get('/metrics', createMetricsHandler(options));
    return router;
}

module.exports = {
    extractBearerToken,
    tokensMatch,
    createMetricsHandler,
    createMetricsRoutes
};
