const express = require('express');

function createAuthRoutes({ authService, sessionService }) {
    const router = express.Router();

    function setSessionCookie(res, token) {
        res.cookie(sessionService.cookieName, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionService.maxAgeMs,
            path: '/'
        });
    }

    function clearSessionCookie(res) {
        res.clearCookie(sessionService.cookieName, { path: '/' });
    }

    router.post('/register', (req, res, next) => {
        try {
            const result = authService.register(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.status(201).json({ user: result.user });
        } catch (error) {
            return next(error);
        }
    });

    router.post('/login', (req, res, next) => {
        try {
            const result = authService.login(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            setSessionCookie(res, result.session.token);
            return res.json({ user: result.user });
        } catch (error) {
            return next(error);
        }
    });

    router.post('/logout', (req, res) => {
        const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
        sessionService.destroySession(token);
        clearSessionCookie(res);
        return res.json({ ok: true });
    });

    router.get('/me', (req, res) => {
        if (!req.user) {
            return res.json({ user: null });
        }

        return res.json({ user: req.user });
    });

    return router;
}

module.exports = {
    createAuthRoutes
};
