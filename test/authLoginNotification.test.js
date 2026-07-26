'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthRoutes } = require('../server/auth/authRoutes');

function createResponse() {
    return {
        statusCode: 200,
        cookies: [],
        payload: null,
        cookie(name, value, options) {
            this.cookies.push({ name, value, options });
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test('successful login notifications run asynchronously and cannot fail the login response', async () => {
    const errors = [];
    let notificationCalls = 0;
    let responseWasWrittenAtNotification = false;
    const user = {
        id: 7,
        accountUuid: '11111111-2222-4333-8444-555555555555',
        username: 'Narcis',
        email: 'narcis@example.com'
    };
    const res = createResponse();
    const router = createAuthRoutes({
        authService: {
            async login() {
                return {
                    ok: true,
                    user,
                    session: { token: 'session-token', socketAuthToken: 'socket-token' }
                };
            }
        },
        sessionService: {
            cookieName: 'f1_session',
            maxAgeMs: 60_000,
            async createSocketAuthToken() { return 'fallback-token'; }
        },
        rateLimiters: {
            login(req, res, next) { next(); },
            register(req, res, next) { next(); }
        },
        onLoginSuccess() {
            notificationCalls += 1;
            responseWasWrittenAtNotification = res.payload !== null;
            throw new Error('notification unavailable');
        },
        logger: {
            error(message, metadata) { errors.push({ message, metadata }); }
        }
    });
    const route = router.stack.find(layer => layer.route?.path === '/login');
    const handler = route.route.stack.at(-1).handle;
    const req = { body: { email: user.email, password: 'secret' }, headers: {}, ip: '127.0.0.1' };
    let nextError = null;

    await handler(req, res, error => { nextError = error; });

    assert.equal(nextError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.user.id, user.id);
    assert.equal(res.payload.socketAuthToken, 'socket-token');
    assert.equal(res.cookies.length, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(notificationCalls, 1);
    assert.equal(responseWasWrittenAtNotification, true);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Post-login notification failed.');
    assert.equal(errors[0].metadata.userId, user.id);
});
