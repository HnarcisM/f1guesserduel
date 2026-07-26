'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const runtimeController = read('public/js/runtimeExperienceController.js');
const runtimeStyles = read('public/css/26-runtime-status.css');
const mainHtml = read('public/index.html');
const adminHtml = read('server/admin/ui/index.html');
const adminScript = read('server/admin/ui/admin.js');
const adminStyles = read('server/admin/ui/admin.css');

test('public runtime controller renders announcements and maintenance without unsafe HTML', () => {
    assert.match(runtimeController, /\/api\/runtime-settings/);
    assert.match(runtimeController, /globalRuntimeAnnouncement/);
    assert.match(runtimeController, /runtimeMaintenanceOverlay/);
    assert.match(runtimeController, /f1:runtime-settings/);
    assert.match(runtimeController, /runtimeSettingsUpdated/);
    assert.match(runtimeController, /runtimeRestriction/);
    assert.match(runtimeController, /aria-labelledby', 'runtimeMaintenanceTitle/);
    assert.match(runtimeController, /reason === 'mode-disabled'/);
    assert.match(runtimeController, /runtimeRestrictionNotice/);
    assert.match(runtimeController, /showRestrictionMessage\(payload\.message\)/);
    assert.match(runtimeController, /if \(loadPromise\) return loadPromise/);
    assert.doesNotMatch(runtimeController, /innerHTML\s*=/);
    assert.match(runtimeStyles, /body\.runtime-maintenance-active \{ overflow: hidden; \}/);
    assert.match(runtimeStyles, /\.runtime-restriction-notice/);
    assert.match(runtimeStyles, /\.runtime-announcement/);
    assert.match(runtimeStyles, /\.runtime-maintenance-overlay/);
    assert.match(runtimeStyles, /\.game-hub-card\.is-runtime-disabled/);
});

test('main page loads runtime controls before the game hub and game bundle', () => {
    const styleIndex = mainHtml.indexOf('/css/26-runtime-status.css');
    const runtimeIndex = mainHtml.indexOf('/js/runtimeExperienceController.js');
    const hubIndex = mainHtml.indexOf('/js/gameHubController.js');
    const bundleIndex = mainHtml.indexOf('/game.bundle.min.js');
    assert.ok(styleIndex > 0);
    assert.ok(runtimeIndex > 0);
    assert.ok(hubIndex > runtimeIndex);
    assert.ok(bundleIndex > hubIndex);
});

test('every dedicated mode page loads public runtime restrictions before its module', () => {
    for (const mode of ['speed-run', 'era', 'streak', 'weekly', 'constructor', 'pilot-sudoku', 'track']) {
        const html = read(`public/modes/${mode}/index.html`);
        const runtimeIndex = html.indexOf('/js/runtimeExperienceController.js');
        const moduleIndex = html.indexOf('type="module"');
        assert.match(html, /\/css\/26-runtime-status\.css/);
        assert.ok(runtimeIndex > 0, `${mode} must load runtime settings`);
        assert.ok(moduleIndex > runtimeIndex, `${mode} runtime guard must load before its module`);
    }
});

test('admin V3 exposes operational controls, dependency health, analytics and suspension history', () => {
    for (const token of [
        'data-admin-view="operations"',
        'data-admin-view="analytics"',
        'adminMaintenanceEnabled',
        'adminAnnouncementEnabled',
        'adminModeToggles',
        'adminServiceStatus',
        'adminAnalyticsBody'
    ]) assert.match(adminHtml, new RegExp(token));

    assert.match(adminScript, /\/api\/admin\/operations\/settings/);
    assert.match(adminScript, /\/api\/admin\/system\/status/);
    assert.match(adminScript, /\/api\/admin\/analytics\/modes/);
    assert.match(adminScript, /Istoric suspendări/);
    assert.match(adminScript, /suspensionHistory/);
    assert.match(adminStyles, /\.admin-operations-grid/);
    assert.match(adminStyles, /\.admin-service-grid/);
    assert.doesNotMatch(adminScript, /innerHTML\s*=/);
});

test('operational database migration is append-only and indexed', () => {
    const migration = read('server/db/migrations/postgres/013_admin_operational_controls.sql');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS app_runtime_settings/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS user_suspension_history/);
    assert.match(migration, /idx_user_suspension_history_user/);
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
