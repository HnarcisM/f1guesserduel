'use strict';

const { normalizeAccountUuid } = require('../auth/accountIdentity');

function normalizeAdminUserIds(userIds = []) {
    return new Set((Array.isArray(userIds) ? userIds : [])
        .map(Number)
        .filter(userId => Number.isSafeInteger(userId) && userId > 0));
}

function normalizeAdminAccountUuids(accountUuids = []) {
    return new Set((Array.isArray(accountUuids) ? accountUuids : [])
        .map(normalizeAccountUuid)
        .filter(Boolean));
}

function createAdminAccess({ accountUuids = [], legacyUserIds = [], userIds = [] } = {}) {
    const allowedAccountUuids = normalizeAdminAccountUuids(accountUuids);
    const allowedLegacyUserIds = normalizeAdminUserIds(
        legacyUserIds.length ? legacyUserIds : userIds
    );
    const mode = allowedAccountUuids.size > 0
        ? 'account-uuid'
        : (allowedLegacyUserIds.size > 0 ? 'legacy-user-id' : 'disabled');

    function isAdminUser(user) {
        if (mode === 'account-uuid') {
            const accountUuid = normalizeAccountUuid(user?.accountUuid || user?.account_uuid);
            return Boolean(accountUuid && allowedAccountUuids.has(accountUuid));
        }
        if (mode === 'legacy-user-id') {
            const userId = Number(user?.id);
            return Number.isSafeInteger(userId) && allowedLegacyUserIds.has(userId);
        }
        return false;
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
        enabled: mode !== 'disabled',
        mode,
        usesLegacyUserIds: mode === 'legacy-user-id',
        isAdminUser,
        requireAdminApi,
        requireAdminPage
    };
}

module.exports = {
    createAdminAccess,
    normalizeAdminAccountUuids,
    normalizeAdminUserIds
};
