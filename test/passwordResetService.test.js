'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    PASSWORD_RESET_INVALID_TOKEN_MESSAGE,
    PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE,
    PASSWORD_RESET_TOKEN_TTL_MS,
    createPasswordResetService,
    getPasswordResetEmailRateLimitKey,
    hashPasswordResetToken,
    normalizePasswordResetEmail
} = require('../server/auth/passwordResetService');

const VALID_TOKEN = 'A'.repeat(43);

function createRepository(overrides = {}) {
    return {
        calls: [],
        async replaceTokenForEmail(payload) {
            this.calls.push({ method: 'replaceTokenForEmail', payload });
            return { userId: 7 };
        },
        async consumeTokenAndResetPassword(payload) {
            this.calls.push({ method: 'consumeTokenAndResetPassword', payload });
            return { userId: 7, sessionsRevoked: 3 };
        },
        ...overrides
    };
}

test('password reset requests store only a token hash and return delivery data only for an existing account', async () => {
    const repository = createRepository();
    const now = Date.parse('2026-08-24T18:00:00.000Z');
    const service = createPasswordResetService(repository, {
        clock: () => now,
        tokenGenerator: () => VALID_TOKEN
    });

    const result = await service.requestPasswordReset({ email: ' NARCIS@Example.COM ' });

    assert.equal(result.accepted, true);
    assert.equal(result.delivery.userId, 7);
    assert.equal(result.delivery.email, 'narcis@example.com');
    assert.equal(result.delivery.token, VALID_TOKEN);
    assert.equal(
        result.delivery.expiresAt,
        new Date(now + PASSWORD_RESET_TOKEN_TTL_MS).toISOString()
    );
    assert.equal(repository.calls.length, 1);
    assert.equal(repository.calls[0].payload.email, 'narcis@example.com');
    assert.equal(repository.calls[0].payload.tokenHash, hashPasswordResetToken(VALID_TOKEN));
    assert.notEqual(repository.calls[0].payload.tokenHash, VALID_TOKEN);
    assert.equal(repository.calls[0].payload.tokenHash.length, 64);
});

test('password reset requests keep the public result identical when the account does not exist', async () => {
    const repository = createRepository({
        async replaceTokenForEmail(payload) {
            this.calls.push({ method: 'replaceTokenForEmail', payload });
            return null;
        }
    });
    const service = createPasswordResetService(repository, {
        tokenGenerator: () => VALID_TOKEN
    });

    const result = await service.requestPasswordReset({ email: 'missing@example.com' });

    assert.deepEqual(result, { accepted: true, delivery: null });
    assert.equal(PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE.includes('Dacă există un cont'), true);
    assert.equal(repository.calls.length, 1);
});

test('invalid reset emails use a non-account sentinel while rate-limit keys hide the email value', async () => {
    const normalized = normalizePasswordResetEmail('not-an-email');
    const firstKey = getPasswordResetEmailRateLimitKey(' Narcis@Example.com ');
    const secondKey = getPasswordResetEmailRateLimitKey('narcis@example.com');

    assert.equal(normalized, '__invalid_password_reset_email__');
    assert.equal(firstKey, secondKey);
    assert.match(firstKey, /^email-[a-f0-9]{64}$/);
    assert.equal(firstKey.includes('narcis'), false);
    assert.equal(firstKey.includes('@'), false);
});

test('password reset confirmation hashes the new password and delegates atomic token consumption', async () => {
    const repository = createRepository();
    const service = createPasswordResetService(repository);

    const result = await service.confirmPasswordReset({
        token: VALID_TOKEN,
        newPassword: 'NewStrongPassword123!'
    });

    assert.equal(result.ok, true);
    assert.equal(result.sessionsRevoked, 3);
    assert.equal(repository.calls.length, 1);
    const payload = repository.calls[0].payload;
    assert.equal(payload.tokenHash, hashPasswordResetToken(VALID_TOKEN));
    assert.match(payload.passwordHash, /^pbkdf2\$220000\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(payload.passwordHash.includes('NewStrongPassword123!'), false);
});

test('expired, consumed or unknown reset tokens return one generic error', async () => {
    const repository = createRepository({
        async consumeTokenAndResetPassword(payload) {
            this.calls.push({ method: 'consumeTokenAndResetPassword', payload });
            return null;
        }
    });
    const service = createPasswordResetService(repository);

    const result = await service.confirmPasswordReset({
        token: VALID_TOKEN,
        newPassword: 'NewStrongPassword123!'
    });

    assert.deepEqual(result, {
        ok: false,
        status: 400,
        message: PASSWORD_RESET_INVALID_TOKEN_MESSAGE
    });
});

test('malformed tokens and weak passwords are rejected before repository consumption', async () => {
    const repository = createRepository();
    const service = createPasswordResetService(repository);

    const malformedToken = await service.confirmPasswordReset({
        token: 'short',
        newPassword: 'NewStrongPassword123!'
    });
    const weakPassword = await service.confirmPasswordReset({
        token: VALID_TOKEN,
        newPassword: 'short'
    });

    assert.equal(malformedToken.message, PASSWORD_RESET_INVALID_TOKEN_MESSAGE);
    assert.equal(weakPassword.status, 400);
    assert.match(weakPassword.message, /8.*64/);
    assert.equal(repository.calls.length, 0);
});

test('password reset TTL is bounded to at most 24 hours', () => {
    const repository = createRepository();

    assert.throws(
        () => createPasswordResetService(repository, { tokenTtlMs: 0 }),
        /between 1 ms and 24 hours/
    );
    assert.throws(
        () => createPasswordResetService(repository, { tokenTtlMs: 24 * 60 * 60 * 1000 + 1 }),
        /between 1 ms and 24 hours/
    );
});
