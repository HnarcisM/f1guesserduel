'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('password reset endpoints stay behind auth CSRF/no-store middleware and bounded request parsing', () => {
    const server = read('server/index.js');
    const routes = read('server/auth/authRoutes.js');
    const requestContext = read('server/middleware/apiRequestContext.js');

    assert.match(server, /app\.use\('\/api\/auth', csrfProtection\);/);
    assert.match(server, /app\.use\('\/api\/auth', createAuthRoutes\(/);
    assert.ok(
        server.indexOf("app.use('/api/auth', csrfProtection);")
        < server.indexOf("app.use('/api/auth', createAuthRoutes({")
    );
    assert.match(routes, /router\.use\(noStoreResponse\);/);
    assert.match(requestContext, /express\.json\(\{ limit: '32kb' \}\)/);
});

test('password reset request and confirmation are independently rate limited', () => {
    const routes = read('server/auth/authRoutes.js');

    assert.match(routes, /keyPrefix: 'auth-password-reset-request-ip'/);
    assert.match(routes, /keyPrefix: 'auth-password-reset-request-email'/);
    assert.match(routes, /keyGenerator: req => getPasswordResetEmailRateLimitKey\(req\.body\?\.email\)/);
    assert.match(routes, /keyPrefix: 'auth-password-reset-confirm'/);
    assert.match(
        routes,
        /'\/password-reset\/request',[\s\S]*passwordResetRequestIpRateLimiter,[\s\S]*passwordResetRequestEmailRateLimiter/
    );
    assert.match(
        routes,
        /router\.post\('\/password-reset\/confirm', passwordResetConfirmRateLimiter/
    );
});

test('password reset delivery logging excludes raw errors, email addresses and tokens', () => {
    const routes = read('server/auth/authRoutes.js');
    const deliveryFailure = routes.match(
        /logger\?\.error\?\.\('Password reset delivery failed\.', \{[\s\S]*?\n\s*\}\);/
    )?.[0] || '';

    assert.match(routes, /res\.once\('finish', deliver\)/);
    assert.match(deliveryFailure, /userId:/);
    assert.match(deliveryFailure, /errorName:/);
    assert.match(deliveryFailure, /errorCode:/);
    assert.doesNotMatch(deliveryFailure, /\berror\s*,/);
    assert.doesNotMatch(deliveryFailure, /email:/);
    assert.doesNotMatch(deliveryFailure, /token:/);
});
