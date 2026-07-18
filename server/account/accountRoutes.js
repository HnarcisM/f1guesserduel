const express = require('express');
const { createMemoryRateLimiter, getRequestIp } = require('../middleware/rateLimit');

function getAccountRateLimitKey(req) {
    const userId = Number(req.user?.id);
    return Number.isSafeInteger(userId) && userId > 0
        ? `user-${userId}`
        : `ip-${getRequestIp(req)}`;
}

function requireAccountAuth(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!req.user) {
        return res.status(401).json({ message: 'Trebuie să fii autentificat pentru a modifica acest cont.' });
    }
    return next();
}

function createAccountSummaryHandler({ accountStatsService }) {
    return async function accountSummaryHandler(req, res, next) {
        try {
            res.set('Cache-Control', 'no-store');
            if (!req.user) {
                return res.status(401).json({ message: 'Trebuie să fii autentificat pentru a vedea contul.' });
            }

            const dashboard = await accountStatsService.getAccountDashboard(req.user.id);
            return res.json({ user: req.user, ...dashboard });
        } catch (error) {
            return next(error);
        }
    };
}

function createAccountRoutes({
    accountStatsService,
    authService,
    sessionService,
    rateLimiters = {},
    rateLimitStore = null,
    logger = console,
    cookieOptions = {}
}) {
    const router = express.Router();
    const updateProfileRateLimiter = rateLimiters.updateProfile || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'account-profile',
        keyGenerator: getAccountRateLimitKey,
        message: 'Prea multe încercări de modificare a profilului. Încearcă din nou mai târziu.',
        store: rateLimitStore,
        logger
    });
    const updatePasswordRateLimiter = rateLimiters.updatePassword || createMemoryRateLimiter({
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'account-password',
        keyGenerator: getAccountRateLimitKey,
        message: 'Prea multe încercări de schimbare a parolei. Încearcă din nou mai târziu.',
        store: rateLimitStore,
        logger
    });
    const logoutAllRateLimiter = rateLimiters.logoutAll || createMemoryRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'account-logout-all',
        keyGenerator: getAccountRateLimitKey,
        message: 'Prea multe cereri de logout. Încearcă din nou peste un minut.',
        store: rateLimitStore,
        logger
    });
    const updateAvatarRateLimiter = rateLimiters.updateAvatar || createMemoryRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 20,
        keyPrefix: 'account-avatar',
        keyGenerator: getAccountRateLimitKey,
        message: 'Prea multe schimbări de avatar. Încearcă din nou peste un minut.',
        store: rateLimitStore,
        logger
    });

    function getSessionToken(req) {
        return req.cookies ? req.cookies[sessionService.cookieName] : null;
    }

    function clearSessionCookie(res) {
        const { maxAge, ...clearOptions } = {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
            ...cookieOptions
        };
        res.clearCookie(sessionService.cookieName, clearOptions);
    }

    router.get('/summary', createAccountSummaryHandler({ accountStatsService }));

    router.patch('/profile', requireAccountAuth, updateProfileRateLimiter, async (req, res, next) => {
        try {
            const result = await authService.updateUsername({
                userId: req.user.id,
                username: req.body?.username,
                currentPassword: req.body?.currentPassword
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            const token = getSessionToken(req);
            return res.json({
                user: result.user,
                socketAuthToken: await sessionService.createSocketAuthToken(token)
            });
        } catch (error) {
            return next(error);
        }
    });

    router.patch('/password', requireAccountAuth, updatePasswordRateLimiter, async (req, res, next) => {
        try {
            const result = await authService.updatePassword({
                userId: req.user.id,
                currentPassword: req.body?.currentPassword,
                newPassword: req.body?.newPassword
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            const token = getSessionToken(req);
            const revoked = await sessionService.destroyOtherSessionsForUser(req.user.id, token);
            return res.json({
                ok: true,
                user: result.user,
                socketAuthToken: await sessionService.createSocketAuthToken(token),
                sessionsRevoked: Number(revoked?.changes ?? revoked?.rowCount) || 0
            });
        } catch (error) {
            return next(error);
        }
    });

    router.patch('/avatar', requireAccountAuth, updateAvatarRateLimiter, async (req, res, next) => {
        try {
            const result = await authService.updateAvatar({
                userId: req.user.id,
                avatarKey: req.body?.avatarKey
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }

            const token = getSessionToken(req);
            return res.json({
                user: result.user,
                socketAuthToken: await sessionService.createSocketAuthToken(token)
            });
        } catch (error) {
            return next(error);
        }
    });

    router.post('/logout-all', requireAccountAuth, logoutAllRateLimiter, async (req, res, next) => {
        try {
            await sessionService.destroyAllSessionsForUser(req.user.id);
            clearSessionCookie(res);
            return res.json({ ok: true, user: null, socketAuthToken: null });
        } catch (error) {
            return next(error);
        }
    });

    return router;
}

module.exports = {
    createAccountRoutes,
    createAccountSummaryHandler,
    getAccountRateLimitKey,
    requireAccountAuth
};
