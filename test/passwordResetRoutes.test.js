'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createAuthRoutes } = require('../server/auth/authRoutes');
const { PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE } = require('../server/auth/passwordResetService');

function passthrough(req, res, next) {
    next();
}

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        clearedCookies: [],
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        },
        clearCookie(name, options) {
            this.clearedCookies.push({ name, options });
            return this;
        },
        cookie() {
            return this;
        }
    };
}

function createRouteOptions(overrides = {}) {
    return {
        authService: {},
        passwordResetService: {
            async requestPasswordReset() {
                return { accepted: true, delivery: null };
            },
            async confirmPasswordReset() {
                return { ok: true, message: 'reset complete', sessionsRevoked: 2 };
            }
        },
        sessionService: {
            cookieName: 'f1_session',
            maxAgeMs: 60_000,
            async createSocketAuthToken() { return null; }
        },
        rateLimiters: {
            login: passthrough,
            register: passthrough,
            passwordResetRequestIp: passthrough,
            passwordResetRequestEmail: passthrough,
            passwordResetConfirm: passthrough
        },
        ...overrides
    };
}

function getLastHandler(router, pathName) {
    const route = router.stack.find(layer => layer.route?.path === pathName);
    assert.ok(route, `Missing route ${pathName}`);
    return route.route.stack.at(-1).handle;
}

test('password reset request response is generic and never exposes the raw token', async () => {
    const rawToken = 'A'.repeat(43);
    const deliveryCalls = [];
    const router = createAuthRoutes(createRouteOptions({
        passwordResetService: {
            async requestPasswordReset() {
                return {
                    accepted: true,
                    delivery: {
                        userId: 7,
                        email: 'narcis@example.com',
                        token: rawToken,
                        expiresAt: '2026-08-24T18:30:00.000Z'
                    }
                };
            },
            async confirmPasswordReset() {
                throw new Error('not used');
            }
        },
        onPasswordResetRequested(delivery) {
            deliveryCalls.push(delivery);
        }
    }));
    const handler = getLastHandler(router, '/password-reset/request');
    const res = createResponse();
    let nextError = null;

    await handler(
        { body: { email: 'narcis@example.com' }, headers: {}, ip: '127.0.0.1' },
        res,
        error => { nextError = error; }
    );

    assert.equal(nextError, null);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.payload, { message: PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE });
    assert.equal(JSON.stringify(res.payload).includes(rawToken), false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(deliveryCalls.length, 1);
    assert.equal(deliveryCalls[0].token, rawToken);
});

test('password reset delivery failures are asynchronous and logs contain only the user id', async () => {
    const errors = [];
    const rawToken = 'B'.repeat(43);
    const router = createAuthRoutes(createRouteOptions({
        passwordResetService: {
            async requestPasswordReset() {
                return {
                    accepted: true,
                    delivery: {
                        userId: 9,
                        email: 'private@example.com',
                        token: rawToken,
                        expiresAt: '2026-08-24T18:30:00.000Z'
                    }
                };
            },
            async confirmPasswordReset() {
                throw new Error('not used');
            }
        },
        onPasswordResetRequested() {
            throw new Error('mail provider unavailable');
        },
        logger: {
            error(message, metadata) {
                errors.push({ message, metadata });
            }
        }
    }));
    const handler = getLastHandler(router, '/password-reset/request');
    const res = createResponse();

    await handler(
        { body: { email: 'private@example.com' }, headers: {}, ip: '127.0.0.1' },
        res,
        () => {}
    );
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(res.statusCode, 202);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Password reset delivery failed.');
    assert.equal(errors[0].metadata.userId, 9);
    assert.equal(errors[0].metadata.errorName, 'Error');
    assert.equal(errors[0].metadata.errorCode, null);
    assert.equal(Object.hasOwn(errors[0].metadata, 'error'), false);
    assert.equal(Object.hasOwn(errors[0].metadata, 'email'), false);
    assert.equal(Object.hasOwn(errors[0].metadata, 'token'), false);
});

test('successful password reset clears the current cookie and returns no authenticated context', async () => {
    const router = createAuthRoutes(createRouteOptions());
    const handler = getLastHandler(router, '/password-reset/confirm');
    const res = createResponse();
    let nextError = null;

    await handler(
        { body: { token: 'A'.repeat(43), newPassword: 'NewStrongPassword123!' } },
        res,
        error => { nextError = error; }
    );

    assert.equal(nextError, null);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
        ok: true,
        message: 'reset complete',
        user: null,
        socketAuthToken: null,
        sessionsRevoked: 2
    });
    assert.equal(res.clearedCookies.length, 1);
    assert.equal(res.clearedCookies[0].name, 'f1_session');
});

test('invalid password reset tokens do not clear the current cookie', async () => {
    const router = createAuthRoutes(createRouteOptions({
        passwordResetService: {
            async requestPasswordReset() {
                throw new Error('not used');
            },
            async confirmPasswordReset() {
                return { ok: false, status: 400, message: 'invalid or expired' };
            }
        }
    }));
    const handler = getLastHandler(router, '/password-reset/confirm');
    const res = createResponse();

    await handler({ body: {} }, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { message: 'invalid or expired' });
    assert.equal(res.clearedCookies.length, 0);
});
