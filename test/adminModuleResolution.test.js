'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ADMIN_MODULE_PATHS = Object.freeze([
    '../server/admin/adminAccess',
    '../server/admin/adminAuditCleanupService',
    '../server/admin/adminAuditRetentionRepository',
    '../server/admin/adminLoginNotifier',
    '../server/admin/adminOperationalRepository',
    '../server/admin/adminPageRoutes',
    '../server/admin/adminRepository',
    '../server/admin/adminRoutes',
    '../server/admin/adminService',
    '../server/runtime/runtimeSettingsCatalog',
    '../server/runtime/runtimeSettingsRepository',
    '../server/runtime/runtimeSettingsService',
    '../server/runtime/runtimeSocketGuard',
    '../server/socket/runtimeGuardedEventRegistrar',
    '../server/routes/runtimeSettingsRoutes'
]);

test('admin backend modules resolve all runtime dependencies', () => {
    for (const modulePath of ADMIN_MODULE_PATHS) {
        assert.doesNotThrow(
            () => require(modulePath),
            `Modulul ${modulePath} trebuie să poată fi încărcat la pornirea serverului.`
        );
    }
});
