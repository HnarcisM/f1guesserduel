'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'server', 'admin', 'ui', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'server', 'admin', 'ui', 'admin.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');

test('admin UI is a dedicated page without the game bundle', () => {
    assert.match(html, /Admin Console/);
    assert.match(html, /data-admin-view="dashboard"/);
    assert.match(html, /data-admin-view="users"/);
    assert.match(html, /data-admin-view="rooms"/);
    assert.match(html, /data-admin-view="audit"/);
    assert.doesNotMatch(html, /game\.bundle\.min\.js|socket\.io/);
});

test('admin destructive actions require a current password and use text-only DOM rendering', () => {
    assert.match(script, /currentPassword/);
    assert.match(script, /revoke-sessions/);
    assert.match(script, /method: 'DELETE'/);
    assert.doesNotMatch(script, /innerHTML\s*=/);
});

test('admin routes are mounted before the public static directory', () => {
    const pageRouteIndex = server.indexOf("app.use('/admin'");
    const apiRouteIndex = server.indexOf("app.use('/api/admin', createAdminRoutes");
    const staticIndex = server.indexOf('app.use(express.static');
    assert.ok(pageRouteIndex > -1 && apiRouteIndex > -1 && staticIndex > -1);
    assert.ok(pageRouteIndex < staticIndex);
    assert.ok(apiRouteIndex < staticIndex);
    assert.match(server, /app\.use\('\/api\/admin', csrfProtection\)/);
});

test('admin V2 exposes user moderation, challenge resets, activity trend and audit filters', () => {
    assert.match(html, /adminActivityTrend/);
    assert.match(html, /adminSuspendDialog/);
    assert.match(html, /adminAuditFilterForm/);
    assert.match(script, /\/suspend/);
    assert.match(script, /\/reactivate/);
    assert.match(script, /reset-\$\{mode\}/);
    assert.match(script, /historyPreserved|Istoricul și XP-ul nu sunt șterse/);
    assert.doesNotMatch(script, /innerHTML\s*=/);
});


test('admin UI surfaces UUID authorization and legacy migration guidance', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'admin', 'ui', 'admin.js'), 'utf8');
    assert.match(source, /accountUuid/);
    assert.match(source, /ADMIN_ACCOUNT_UUIDS/);
    assert.match(source, /legacyMigrationRequired/);
});

test('admin E2E suite is wired into package scripts and the browser CI gate', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, 'e2e', 'admin.e2e.test.js'), 'utf8');

    assert.equal(
        packageJson.scripts['test:e2e:admin'],
        'node --test --test-timeout=90000 test/e2e/admin.e2e.test.js'
    );
    assert.match(workflow, /name: Run admin console flows/);
    assert.match(workflow, /npm run test:e2e:admin/);
    assert.match(workflow, /ADMIN_OUTCOME: \$\{\{ steps\.admin_tests\.outcome \}\}/);
    assert.match(workflow, /"\$ADMIN_OUTCOME"/);
    assert.match(source, /utilizatorul normal primește 404 pentru \/admin/);
    assert.match(source, /suspendarea cu parolă greșită este refuzată/);
    assert.match(source, /auditul poate fi filtrat după categorie și text/);
    assert.match(source, /panoul rămâne utilizabil pe ecrane mobile/);
    assert.match(source, /administratorul poate inspecta controalele operaționale și statisticile/);
});



test('admin responsive layout contains wide trend and table content inside the viewport', () => {
    const css = fs.readFileSync(path.join(root, 'server', 'admin', 'ui', 'admin.css'), 'utf8');
    assert.match(css, /\.admin-view, \.admin-panel, \.admin-trend \{ min-width: 0; max-width: 100%; \}/);
    assert.match(css, /@media \(max-width: 920px\)[\s\S]*\.admin-shell \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(css, /\.admin-trend \{[\s\S]*overflow-x: auto;/);
    assert.match(css, /\.admin-table-wrap \{ overflow-x: auto; \}/);
});


test('admin audit UI exposes filtered JSON and CSV exports with retention metadata', () => {
    assert.match(html, /adminAuditExportJson/);
    assert.match(html, /adminAuditExportCsv/);
    assert.match(script, /\/api\/admin\/audit\/export/);
    assert.match(script, /downloadAudit\('json'\)/);
    assert.match(script, /downloadAudit\('csv'\)/);
    assert.match(script, /retenție \$\{formatNumber\(payload\.retentionDays\)\} zile/);
    assert.doesNotMatch(script, /innerHTML\s*=/);
});


test('admin mobile topbar wraps without widening fold viewports', () => {
    const css = fs.readFileSync(path.join(root, 'server', 'admin', 'ui', 'admin.css'), 'utf8');
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-topbar \{ align-items: flex-end; flex-wrap: wrap; gap: 12px; \}/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-topbar > div \{ min-width: 0; \}/);
});


test('admin mobile user dialog contains long account details and controls inside the viewport', () => {
    const css = fs.readFileSync(path.join(root, 'server', 'admin', 'ui', 'admin.css'), 'utf8');
    assert.match(css, /\.admin-dialog-wide \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
    assert.match(css, /\.admin-user-dialog-head \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
    assert.match(css, /\.admin-detail-section strong \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-dialog \{ width: calc\(100vw - 24px\); max-width: calc\(100vw - 24px\); \}/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-user-dialog-head \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-detail-section > div \{ flex-wrap: wrap; \}/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.admin-detail-section strong \{ flex: 1 1 100%; text-align: left; \}/);
});
