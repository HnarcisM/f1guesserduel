const express = require('express');
const { createMemoryRateLimiter } = require('../middleware/rateLimit');
const { sanitizeUser } = require('./authService');

function createAuthRoutes({
    authService,
    sessionService,
    rateLimiters = {},
    rateLimitStore = null,
    logger = console,
    metrics = null,
    cookieOptions = {}
}) {
    const router = express.Router();
    const loginRateLimiter = rateLimiters.login || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'auth-login',
        message: 'Prea multe încercări de login. Încearcă din nou peste câteva minute.',
        store: rateLimitStore,
        logger,
        metrics
    });
    const registerRateLimiter = rateLimiters.register || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 3,
        keyPrefix: 'auth-register',
        message: 'Prea multe încercări de înregistrare. Încearcă din nou peste câteva minute.',
        store: rateLimitStore,
        logger,
        metrics
    });

    function buildCookieOptions(extraOptions = {}) {
        return {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
            ...cookieOptions,
            ...extraOptions
        };
    }

    function setSessionCookie(res, token) {
        res.cookie(sessionService.cookieName, token, buildCookieOptions({
            maxAge: sessionService.maxAgeMs
        }));
    }

    function clearSessionCookie(res) {
        const { maxAge, ...clearOptions } = buildCookieOptions();
        res.clearCookie(sessionService.cookieName, clearOptions);
    }

    function buildAuthResponse(user, socketAuthToken = null) {
        return {
            user: sanitizeUser(user),
            socketAuthToken
        };
    }

    async function getSocketAuthToken(req, session = null) {
        if (session?.socketAuthToken) return session.socketAuthToken;
        if (req.authContext?.socketAuthToken) return req.authContext.socketAuthToken;

        const sessionToken = session?.token
            || (req.cookies ? req.cookies[sessionService.cookieName] : null);
        return sessionService.createSocketAuthToken(sessionToken);
    }

    router.post('/register', registerRateLimiter, async (req, res, next) => {
        try {
            const result = await authService.register(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.status(201).json(buildAuthResponse(
                result.user,
                await getSocketAuthToken(req, result.session)
            ));
        } catch (error) {
            return next(error);
        }
    });

    router.post('/login', loginRateLimiter, async (req, res, next) => {
        try {
            const result = await authService.login(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.json(buildAuthResponse(
                result.user,
                await getSocketAuthToken(req, result.session)
            ));
        } catch (error) {
            return next(error);
        }
    });

    router.post('/logout', async (req, res, next) => {
        try {
            const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
            await sessionService.destroySession(token);
            clearSessionCookie(res);
            return res.json({ ok: true, user: null, socketAuthToken: null });
        } catch (error) {
            return next(error);
        }
    });

    router.get('/me', async (req, res, next) => {
        try {
            if (!req.user) {
                return res.json({ user: null, socketAuthToken: null });
            }

            return res.json(buildAuthResponse(
                req.user,
                await getSocketAuthToken(req)
            ));
        } catch (error) {
            return next(error);
        }
    });

    return router;
}

module.exports = {
    createAuthRoutes
};
