const express = require('express');
const { createMemoryRateLimiter } = require('../middleware/rateLimit');
const { sanitizeUser } = require('./authService');
const { noStoreResponse } = require('../middleware/noStoreResponse');
const {
    PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE,
    getPasswordResetEmailRateLimitKey
} = require('./passwordResetService');

function createAuthRoutes({
    authService,
    passwordResetService = null,
    sessionService,
    rateLimiters = {},
    rateLimitStore = null,
    logger = console,
    metrics = null,
    cookieOptions = {},
    onLoginSuccess = null,
    onPasswordResetRequested = null
}) {
    const router = express.Router();
    router.use(noStoreResponse);
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
    const passwordResetRequestIpRateLimiter = rateLimiters.passwordResetRequestIp || createMemoryRateLimiter({
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'auth-password-reset-request-ip',
        message: 'Prea multe cereri de resetare. Încearcă din nou mai târziu.',
        store: rateLimitStore,
        logger,
        metrics
    });
    const passwordResetRequestEmailRateLimiter = rateLimiters.passwordResetRequestEmail || createMemoryRateLimiter({
        windowMs: 30 * 60 * 1000,
        maxRequests: 3,
        keyPrefix: 'auth-password-reset-request-email',
        keyGenerator: req => getPasswordResetEmailRateLimitKey(req.body?.email),
        message: 'Prea multe cereri de resetare. Încearcă din nou mai târziu.',
        store: rateLimitStore,
        logger,
        metrics
    });
    const passwordResetConfirmRateLimiter = rateLimiters.passwordResetConfirm || createMemoryRateLimiter({
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
        keyPrefix: 'auth-password-reset-confirm',
        message: 'Prea multe încercări de resetare. Încearcă din nou mai târziu.',
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

    function schedulePasswordResetDelivery(res, delivery) {
        if (!delivery || typeof onPasswordResetRequested !== 'function') return;

        const deliver = () => {
            Promise.resolve()
                .then(() => onPasswordResetRequested(delivery))
                .catch(error => {
                    logger?.error?.('Password reset delivery failed.', {
                        userId: delivery.userId,
                        errorName: typeof error?.name === 'string' ? error.name : 'Error',
                        errorCode: typeof error?.code === 'string' ? error.code : null
                    });
                });
        };

        if (typeof res.once === 'function') {
            res.once('finish', deliver);
        } else {
            setImmediate(deliver);
        }
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
            const response = res.json(buildAuthResponse(
                result.user,
                await getSocketAuthToken(req, result.session)
            ));
            if (typeof onLoginSuccess === 'function') {
                Promise.resolve()
                    .then(() => onLoginSuccess({ user: result.user, request: req }))
                    .catch(error => {
                        logger?.error?.('Post-login notification failed.', { error, userId: result.user?.id });
                    });
            }
            return response;
        } catch (error) {
            return next(error);
        }
    });

    router.post(
        '/password-reset/request',
        passwordResetRequestIpRateLimiter,
        passwordResetRequestEmailRateLimiter,
        async (req, res, next) => {
            try {
                if (!passwordResetService?.requestPasswordReset) {
                    throw new Error('Password reset service is not configured.');
                }
                const result = await passwordResetService.requestPasswordReset(req.body || {});
                schedulePasswordResetDelivery(res, result.delivery);
                return res.status(202).json({
                    message: PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE
                });
            } catch (error) {
                return next(error);
            }
        }
    );

    router.post('/password-reset/confirm', passwordResetConfirmRateLimiter, async (req, res, next) => {
        try {
            if (!passwordResetService?.confirmPasswordReset) {
                throw new Error('Password reset service is not configured.');
            }
            const result = await passwordResetService.confirmPasswordReset(req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            clearSessionCookie(res);
            return res.json({
                ok: true,
                message: result.message,
                user: null,
                socketAuthToken: null,
                sessionsRevoked: Number(result.sessionsRevoked) || 0
            });
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
