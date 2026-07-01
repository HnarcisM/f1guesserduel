const express = require('express');
const { createMemoryRateLimiter } = require('../middleware/rateLimit');

function createAuthRoutes({ authService, sessionService, rateLimiters = {}, cookieOptions = {} }) {
    const router = express.Router();
    const loginRateLimiter = rateLimiters.login || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'auth-login',
        message: 'Prea multe încercări de login. Încearcă din nou peste câteva minute.'
    });
    const registerRateLimiter = rateLimiters.register || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 3,
        keyPrefix: 'auth-register',
        message: 'Prea multe încercări de înregistrare. Încearcă din nou peste câteva minute.'
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

    function buildAuthResponse(user, sessionToken = null) {
        return {
            user: user || null,
            socketAuthToken: sessionService.createSocketAuthToken(sessionToken)
        };
    }

    router.post('/register', registerRateLimiter, (req, res, next) => {
        try {
            const result = authService.register(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.status(201).json(buildAuthResponse(result.user, result.session.token));
        } catch (error) {
            return next(error);
        }
    });

    router.post('/login', loginRateLimiter, (req, res, next) => {
        try {
            const result = authService.login(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.json(buildAuthResponse(result.user, result.session.token));
        } catch (error) {
            return next(error);
        }
    });

    router.post('/logout', (req, res) => {
        const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
        sessionService.destroySession(token);
        clearSessionCookie(res);
        return res.json({ ok: true, user: null, socketAuthToken: null });
    });

    router.get('/me', (req, res) => {
        if (!req.user) {
            return res.json({ user: null, socketAuthToken: null });
        }

        const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
        return res.json(buildAuthResponse(req.user, token));
    });

    return router;
}

module.exports = {
    createAuthRoutes
};
