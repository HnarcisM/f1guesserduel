const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cookieParser = require('cookie-parser');
const express = require('express');

const { createAccountRoutes } = require('../server/account/accountRoutes');
const { createAuthRoutes } = require('../server/auth/authRoutes');
const { createCsrfProtectionMiddleware } = require('../server/middleware/csrfProtection');

const TRUSTED_ORIGIN = 'https://f1guesserduel.onrender.com';

test('production server mounts CSRF protection on account mutations and logout', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');

    assert.match(serverSource, /app\.use\('\/api\/auth\/logout', csrfProtection\)/);
    assert.match(serverSource, /app\.use\('\/api\/account', csrfProtection\)/);
});

function allowRequest(req, res, next) {
    next();
}

function createTestApp() {
    const app = express();
    const sessionService = {
        cookieName: 'f1_session',
        maxAgeMs: 60_000,
        async createSocketAuthToken() { return 'socket-token'; },
        async destroySession() {},
        async destroyAllSessionsForUser() {},
        async destroyOtherSessionsForUser() { return { changes: 0 }; }
    };
    const csrfProtection = createCsrfProtectionMiddleware({
        allowedOrigins: [TRUSTED_ORIGIN]
    });

    app.use(express.json());
    app.use(cookieParser());
    app.use((req, res, next) => {
        if (req.cookies?.f1_session) {
            req.user = {
                id: 7,
                username: 'Csrf_Test',
                email: 'csrf@example.com',
                avatarKey: 'helmet-red'
            };
        }
        next();
    });
    app.use('/api/auth/logout', csrfProtection);
    app.use('/api/account', csrfProtection);
    app.use('/api/auth', createAuthRoutes({
        authService: {},
        sessionService,
        rateLimiters: { login: allowRequest, register: allowRequest }
    }));
    app.use('/api/account', createAccountRoutes({
        accountStatsService: {
            async getAccountDashboard() {
                return { stats: {}, recentGames: [], progress: {}, achievements: [] };
            }
        },
        authService: {
            async updateAvatar({ userId, avatarKey }) {
                return {
                    ok: true,
                    user: { id: userId, username: 'Csrf_Test', avatarKey }
                };
            }
        },
        sessionService,
        rateLimiters: {
            updateProfile: allowRequest,
            updatePassword: allowRequest,
            updateAvatar: allowRequest,
            logoutAll: allowRequest
        }
    }));

    return app;
}

async function sendJson(baseUrl, path, { method = 'GET', origin, body } = {}) {
    const headers = { Cookie: 'f1_session=test-session' };
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return {
        response,
        data: await response.json().catch(() => ({}))
    };
}

test('real account routes enforce CSRF origins without breaking trusted updates', async () => {
    const server = createTestApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const missingOrigin = await sendJson(baseUrl, '/api/account/avatar', {
            method: 'PATCH',
            body: { avatarKey: 'helmet-blue' }
        });
        assert.equal(missingOrigin.response.status, 403);
        assert.match(missingOrigin.data.message, /CSRF/);

        const foreignOrigin = await sendJson(baseUrl, '/api/account/avatar', {
            method: 'PATCH',
            origin: 'https://evil.example',
            body: { avatarKey: 'helmet-blue' }
        });
        assert.equal(foreignOrigin.response.status, 403);

        const trustedUpdate = await sendJson(baseUrl, '/api/account/avatar', {
            method: 'PATCH',
            origin: TRUSTED_ORIGIN,
            body: { avatarKey: 'helmet-blue' }
        });
        assert.equal(trustedUpdate.response.status, 200);
        assert.equal(trustedUpdate.data.user.avatarKey, 'helmet-blue');

        const blockedLogout = await sendJson(baseUrl, '/api/auth/logout', {
            method: 'POST',
            body: {}
        });
        assert.equal(blockedLogout.response.status, 403);

        const safeSummary = await sendJson(baseUrl, '/api/account/summary');
        assert.equal(safeSummary.response.status, 200);

        const trustedLogout = await sendJson(baseUrl, '/api/auth/logout', {
            method: 'POST',
            origin: TRUSTED_ORIGIN,
            body: {}
        });
        assert.equal(trustedLogout.response.status, 200);
        assert.equal(trustedLogout.data.user, null);
    } finally {
        server.close();
        await once(server, 'close');
    }
});
