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
