'use strict';

const express = require('express');
const { createMemoryRateLimiter, getRequestIp } = require('../middleware/rateLimit');

function getAdminRateLimitKey(req) {
    const userId = Number(req.user?.id);
    return Number.isSafeInteger(userId) && userId > 0
        ? `admin-${userId}`
        : `ip-${getRequestIp(req)}`;
}

function createAdminRoutes({
    adminAccess,
    adminService,
    authService,
    rateLimitStore = null,
    logger = console,
    metrics = null,
    rateLimiters = {}
}) {
    const router = express.Router();
    const readLimiter = rateLimiters.read || createMemoryRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 120,
        keyPrefix: 'admin-read',
        keyGenerator: getAdminRateLimitKey,
        message: 'Prea multe cereri administrative. Încearcă din nou peste un minut.',
        store: rateLimitStore,
        logger,
        metrics
    });
    const writeLimiter = rateLimiters.write || createMemoryRateLimiter({
        windowMs: 10 * 60 * 1000,
        maxRequests: 20,
        keyPrefix: 'admin-write',
        keyGenerator: getAdminRateLimitKey,
        message: 'Prea multe acțiuni administrative. Încearcă din nou mai târziu.',
        store: rateLimitStore,
        logger,
        metrics
    });

    router.use(adminAccess.requireAdminApi);

    async function requireAdminPassword(req, res, next) {
        try {
            const password = req.body?.currentPassword;
            const verified = await authService.verifyPasswordForUser(req.user.id, password);
            if (!verified) {
                await adminService.recordAuditEvent({
                    adminUserId: req.user.id,
                    action: 'admin.reauthentication.failed',
                    targetType: 'route',
                    targetId: String(req.originalUrl || req.path || '').slice(0, 200),
                    details: { method: req.method },
                    requestId: req.requestId
                });
                return res.status(401).json({ message: 'Parola administratorului este greșită.' });
            }
            return next();
        } catch (error) {
            return next(error);
        }
    }

    router.get('/session', readLimiter, (req, res) => res.json({
        user: {
            id: req.user.id,
            accountUuid: req.user.accountUuid,
            username: req.user.username,
            email: req.user.email
        },
        admin: true,
        authorization: {
            mode: adminAccess.mode,
            legacyMigrationRequired: adminAccess.usesLegacyUserIds
        }
    }));

    router.get('/overview', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.getOverview());
        } catch (error) {
            return next(error);
        }
    });

    router.get('/operations/settings', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.getOperationalSettings());
        } catch (error) {
            return next(error);
        }
    });

    router.put('/operations/settings', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.updateOperationalSettings({
                adminUserId: req.user.id,
                patch: req.body?.settings,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.get('/analytics/modes', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.getModeDifficultyStats());
        } catch (error) {
            return next(error);
        }
    });

    router.get('/system/status', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.getDependencyStatus());
        } catch (error) {
            return next(error);
        }
    });

    router.get('/users', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.listUsers({
                search: req.query?.search,
                limit: req.query?.limit,
                offset: req.query?.offset
            }));
        } catch (error) {
            return next(error);
        }
    });

    router.get('/users/:userId', readLimiter, async (req, res, next) => {
        try {
            const result = await adminService.getUserDetails(req.params.userId);
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.post('/users/:userId/revoke-sessions', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.revokeUserSessions({
                adminUserId: req.user.id,
                targetUserId: req.params.userId,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });


    router.post('/users/:userId/suspend', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.suspendUser({
                adminUserId: req.user.id,
                targetUserId: req.params.userId,
                duration: req.body?.duration,
                reason: req.body?.reason,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.post('/users/:userId/reactivate', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.reactivateUser({
                adminUserId: req.user.id,
                targetUserId: req.params.userId,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.post('/users/:userId/reset-daily', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.resetDailyAttempt({
                adminUserId: req.user.id,
                targetUserId: req.params.userId,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.post('/users/:userId/reset-weekly', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.resetWeeklyAttempt({
                adminUserId: req.user.id,
                targetUserId: req.params.userId,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.get('/rooms', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.listRooms());
        } catch (error) {
            return next(error);
        }
    });

    router.delete('/rooms/:roomId', writeLimiter, requireAdminPassword, async (req, res, next) => {
        try {
            const result = await adminService.closeRoom({
                adminUserId: req.user.id,
                roomId: req.params.roomId,
                requestId: req.requestId
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            return res.json(result);
        } catch (error) {
            return next(error);
        }
    });

    router.get('/audit/export', readLimiter, async (req, res, next) => {
        try {
            const result = await adminService.exportAudit({
                format: req.query?.format,
                action: req.query?.action,
                search: req.query?.search
            });
            if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
            res.set('Content-Type', result.contentType);
            res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
            res.set('X-Content-Type-Options', 'nosniff');
            return res.send(result.body);
        } catch (error) {
            return next(error);
        }
    });

    router.get('/audit', readLimiter, async (req, res, next) => {
        try {
            return res.json(await adminService.listAudit({
                limit: req.query?.limit,
                offset: req.query?.offset,
                action: req.query?.action,
                search: req.query?.search
            }));
        } catch (error) {
            return next(error);
        }
    });

    return router;
}

module.exports = {
    createAdminRoutes,
    getAdminRateLimitKey
};
