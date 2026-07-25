'use strict';

function normalizeAdminUserIds(userIds = []) {
    return new Set((Array.isArray(userIds) ? userIds : [])
        .map(Number)
        .filter(userId => Number.isSafeInteger(userId) && userId > 0));
}

function createAdminAccess({ userIds = [] } = {}) {
    const allowedUserIds = normalizeAdminUserIds(userIds);

    function isAdminUser(user) {
        const userId = Number(user?.id);
        return Number.isSafeInteger(userId) && allowedUserIds.has(userId);
    }

    function requireAdminApi(req, res, next) {
        res.set('Cache-Control', 'no-store');
        if (!req.user) {
            return res.status(401).json({ message: 'Autentificarea este necesară.' });
        }
        if (!isAdminUser(req.user)) {
            return res.status(403).json({ message: 'Nu ai permisiunea de a accesa această zonă.' });
        }
        return next();
    }

    function requireAdminPage(req, res, next) {
        res.set('Cache-Control', 'no-store');
        if (!isAdminUser(req.user)) {
            return res.status(404).type('text/plain').send('Not found');
        }
        return next();
    }

    return {
        enabled: allowedUserIds.size > 0,
        isAdminUser,
        requireAdminApi,
        requireAdminPage
    };
}

module.exports = {
    createAdminAccess,
    normalizeAdminUserIds
};
