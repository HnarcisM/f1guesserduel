const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createAccountRoutes,
    createAccountSummaryHandler,
    requireAccountAuth
} = require('../server/account/accountRoutes');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        clearedCookie: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        clearCookie(name, options) {
            this.clearedCookie = { name, options };
            return this;
        }
    };
}

function createSettingsRouter({ authService = {}, sessionService = {} } = {}) {
    const allow = (req, res, next) => next();
    return createAccountRoutes({
        accountStatsService: {
            async getAccountDashboard() {
                return {
                    stats: {},
                    recentGames: [],
                    progress: { level: 1, totalXp: 0 },
                    achievements: []
                };
            }
        },
        authService,
        sessionService: {
            cookieName: 'f1_session',
            async createSocketAuthToken() { return 'fresh-socket-token'; },
            ...sessionService
        },
        rateLimiters: {
            updateProfile: allow,
            updatePassword: allow,
            updateAvatar: allow,
            logoutAll: allow
        },
        cookieOptions: { secure: true, sameSite: 'lax' }
    });
}

function getFinalRouteHandler(router, routePath) {
    const route = router.stack.find(layer => layer.route?.path === routePath)?.route;
    return route?.stack.at(-1)?.handle;
}

test('account summary requires authentication and disables caching', async () => {
    const handler = createAccountSummaryHandler({
        accountStatsService: { async getAccountStats() { throw new Error('must not run'); } }
    });
    const response = createResponse();

    await handler({ user: null }, response, error => { throw error; });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.match(response.body.message, /autentificat/);
});

test('account summary returns only the authenticated user statistics', async () => {
    const requestedUserIds = [];
    const stats = { totals: { played: 3 }, modes: {} };
    const recentGames = [{ mode: 'single', outcome: 'win', attempts: 2 }];
    const progress = { level: 2, totalXp: 250, progressPercent: 50 };
    const achievements = [{ key: 'first-win', unlocked: true }];
    const handler = createAccountSummaryHandler({
        accountStatsService: {
            async getAccountDashboard(userId) {
                requestedUserIds.push(userId);
                return { stats, recentGames, progress, achievements };
            }
        }
    });
    const user = { id: 7, username: 'Narcis', email: 'n@example.com' };
    const response = createResponse();

    await handler({ user, query: { userId: 999 } }, response, error => { throw error; });

    assert.deepEqual(requestedUserIds, [7]);
    assert.equal(response.body.user.id, user.id);
    assert.equal(response.body.user.username, user.username);
    assert.equal(response.body.user.avatarKey, 'helmet-red');
    assert.equal(response.body.user.usernameChangeAvailableAt, null);
    assert.deepEqual(response.body.stats, stats);
    assert.deepEqual(response.body.recentGames, recentGames);
    assert.deepEqual(response.body.progress, progress);
    assert.deepEqual(response.body.achievements, achievements);
    assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('account mutations reject guests before processing credentials', () => {
    const response = createResponse();
    let nextCalled = false;

    requireAccountAuth({ user: null }, response, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('profile update uses the authenticated user and refreshes socket authentication', async () => {
    const calls = [];
    const router = createSettingsRouter({
        authService: {
            async updateUsername(payload) {
                calls.push(payload);
                return {
                    ok: true,
                    user: { id: 7, username: 'Narcis_New', email: 'narcis@example.com' }
                };
            }
        }
    });
    const handler = getFinalRouteHandler(router, '/profile');
    const response = createResponse();

    await handler({
        user: { id: 7 },
        body: { username: 'Narcis_New', currentPassword: 'secret', userId: 999 },
        cookies: { f1_session: 'current-session' }
    }, response, error => { throw error; });

    assert.deepEqual(calls, [{ userId: 7, username: 'Narcis_New', currentPassword: 'secret' }]);
    assert.equal(response.body.user.username, 'Narcis_New');
    assert.equal(response.body.socketAuthToken, 'fresh-socket-token');
});

test('password update revokes other sessions while preserving the current session', async () => {
    const calls = [];
    const router = createSettingsRouter({
        authService: {
            async updatePassword(payload) {
                calls.push(payload);
                return { ok: true, user: { id: 7, username: 'Narcis' } };
            }
        },
        sessionService: {
            async destroyOtherSessionsForUser(userId, token) {
                calls.push({ userId, token });
                return { changes: 2 };
            }
        }
    });
    const handler = getFinalRouteHandler(router, '/password');
    const response = createResponse();

    await handler({
        user: { id: 7 },
        body: { currentPassword: 'old-secret', newPassword: 'new-secret', userId: 999 },
        cookies: { f1_session: 'current-session' }
    }, response, error => { throw error; });

    assert.deepEqual(calls[0], { userId: 7, currentPassword: 'old-secret', newPassword: 'new-secret' });
    assert.deepEqual(calls[1], { userId: 7, token: 'current-session' });
    assert.equal(response.body.sessionsRevoked, 2);
    assert.equal(response.body.socketAuthToken, 'fresh-socket-token');
});

test('avatar update uses the authenticated user and refreshes socket authentication', async () => {
    const calls = [];
    const router = createSettingsRouter({
        authService: {
            async updateAvatar(payload) {
                calls.push(payload);
                return {
                    ok: true,
                    user: { id: 7, username: 'Narcis', avatarKey: 'helmet-purple' }
                };
            }
        }
    });
    const handler = getFinalRouteHandler(router, '/avatar');
    const response = createResponse();

    await handler({
        user: { id: 7 },
        body: { avatarKey: 'helmet-purple', userId: 999 },
        cookies: { f1_session: 'current-session' }
    }, response, error => { throw error; });

    assert.deepEqual(calls, [{ userId: 7, avatarKey: 'helmet-purple' }]);
    assert.equal(response.body.user.avatarKey, 'helmet-purple');
    assert.equal(response.body.socketAuthToken, 'fresh-socket-token');
});

test('logout everywhere revokes every session and clears the hardened cookie', async () => {
    const revokedUserIds = [];
    const router = createSettingsRouter({
        sessionService: {
            async destroyAllSessionsForUser(userId) {
                revokedUserIds.push(userId);
                return { changes: 3 };
            }
        }
    });
    const handler = getFinalRouteHandler(router, '/logout-all');
    const response = createResponse();

    await handler({ user: { id: 7 } }, response, error => { throw error; });

    assert.deepEqual(revokedUserIds, [7]);
    assert.deepEqual(response.body, { ok: true, user: null, socketAuthToken: null });
    assert.equal(response.clearedCookie.name, 'f1_session');
    assert.equal(response.clearedCookie.options.httpOnly, true);
    assert.equal(response.clearedCookie.options.secure, true);
    assert.equal(response.clearedCookie.options.path, '/');
});
