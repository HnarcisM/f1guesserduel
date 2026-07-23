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

test('production server mounts CSRF protection on all auth and account mutations', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');

    assert.match(serverSource, /app\.use\('\/api\/auth', csrfProtection\)/);
    assert.match(serverSource, /app\.use\('\/api\/account', csrfProtection\)/);
});

function allowRequest(req, res, next) {
    next();
}

function createTestApp() {
    const app = express();
    const authCalls = { login: 0, register: 0 };
    const sessionCalls = { createSocketAuthToken: 0 };
    const sessionService = {
        cookieName: 'f1_session',
        maxAgeMs: 60_000,
        async createSocketAuthToken() {
            sessionCalls.createSocketAuthToken += 1;
            return 'socket-token';
        },
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
    app.use('/api/auth', csrfProtection);
    app.use('/api/account', csrfProtection);
    app.use('/api/auth', createAuthRoutes({
        authService: {
            async login() {
                authCalls.login += 1;
                return {
                    ok: true,
                    user: {
                        id: 8,
                        username: 'Login_Test',
                        email: 'login@example.com',
                        avatarKey: 'helmet-blue'
                    },
                    session: {
                        token: 'login-session',
                        socketAuthToken: 'login-socket-token'
                    }
                };
            },
            async register() {
                authCalls.register += 1;
                return {
                    ok: true,
                    user: {
                        id: 9,
                        username: 'Register_Test',
                        email: 'register@example.com',
                        avatarKey: 'helmet-green'
                    },
                    session: {
                        token: 'register-session',
                        socketAuthToken: 'register-socket-token'
                    }
                };
            }
        },
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

    return { app, authCalls, sessionCalls };
}

async function sendJson(baseUrl, path, {
    method = 'GET',
    origin,
    fetchSite,
    body
} = {}) {
    const headers = { Cookie: 'f1_session=test-session' };
    if (origin) headers.Origin = origin;
    if (fetchSite) headers['Sec-Fetch-Site'] = fetchSite;
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
    const { app } = createTestApp();
    const server = app.listen(0, '127.0.0.1');
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

test('real auth routes reject login CSRF and allow trusted login and registration', async () => {
    const { app, authCalls, sessionCalls } = createTestApp();
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const missingOriginLogin = await sendJson(baseUrl, '/api/auth/login', {
            method: 'POST',
            body: { email: 'attacker@example.com', password: 'password123' }
        });
        assert.equal(missingOriginLogin.response.status, 403);
        assert.match(missingOriginLogin.data.message, /CSRF/);

        const foreignOriginRegister = await sendJson(baseUrl, '/api/auth/register', {
            method: 'POST',
            origin: 'https://evil.example',
            body: {
                username: 'Attacker',
                email: 'attacker@example.com',
                password: 'password123'
            }
        });
        assert.equal(foreignOriginRegister.response.status, 403);

        const crossSiteLogin = await sendJson(baseUrl, '/api/auth/login', {
            method: 'POST',
            origin: TRUSTED_ORIGIN,
            fetchSite: 'cross-site',
            body: { email: 'attacker@example.com', password: 'password123' }
        });
        assert.equal(crossSiteLogin.response.status, 403);
        assert.deepEqual(authCalls, { login: 0, register: 0 });

        const trustedLogin = await sendJson(baseUrl, '/api/auth/login', {
            method: 'POST',
            origin: TRUSTED_ORIGIN,
            fetchSite: 'same-origin',
            body: { email: 'login@example.com', password: 'password123' }
        });
        assert.equal(trustedLogin.response.status, 200);
        assert.equal(trustedLogin.data.user.username, 'Login_Test');
        assert.equal(trustedLogin.data.socketAuthToken, 'login-socket-token');

        const trustedRegister = await sendJson(baseUrl, '/api/auth/register', {
            method: 'POST',
            origin: TRUSTED_ORIGIN,
            fetchSite: 'same-origin',
            body: {
                username: 'Register_Test',
                email: 'register@example.com',
                password: 'password123'
            }
        });
        assert.equal(trustedRegister.response.status, 201);
        assert.equal(trustedRegister.data.user.username, 'Register_Test');
        assert.equal(trustedRegister.data.socketAuthToken, 'register-socket-token');
        assert.deepEqual(authCalls, { login: 1, register: 1 });
        assert.equal(sessionCalls.createSocketAuthToken, 0);

        const safeAuthRead = await sendJson(baseUrl, '/api/auth/me');
        assert.equal(safeAuthRead.response.status, 200);
        assert.equal(safeAuthRead.data.user.username, 'Csrf_Test');
        assert.equal(sessionCalls.createSocketAuthToken, 1);
    } finally {
        server.close();
        await once(server, 'close');
    }
});
