'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    PASSWORD_RESET_EMAIL_SUBJECT,
    buildPasswordResetEmail,
    buildPasswordResetUrl,
    createPasswordResetEmailNotifier,
    normalizePublicOrigin
} = require('../server/email/passwordResetEmailNotifier');

const TOKEN = 'ab'.repeat(32);
const DELIVERY = {
    userId: 7,
    email: 'driver@example.com',
    token: TOKEN,
    expiresAt: '2026-08-24T20:30:00.000Z'
};

test('password reset notifier skips cleanly while no email transport is configured', async () => {
    let sends = 0;
    const notifier = createPasswordResetEmailNotifier({
        emailDeliveryService: {
            isConfigured() { return false; },
            async send() { sends += 1; }
        }
    });

    assert.deepEqual(await notifier.notify(DELIVERY), {
        ok: false,
        skipped: true,
        reason: 'email-not-configured'
    });
    assert.equal(sends, 0);
});

test('password reset email uses a fragment token so the secret is not sent in HTTP URLs', () => {
    const message = buildPasswordResetEmail({
        ...DELIVERY,
        publicOrigin: 'https://f1guesserduel.onrender.com',
        requireHttps: true
    });

    assert.equal(message.to, DELIVERY.email);
    assert.equal(message.subject, PASSWORD_RESET_EMAIL_SUBJECT);
    assert.equal(message.messageType, 'password-reset');
    assert.match(message.text, new RegExp(`/reset-password#token=${TOKEN}`));
    assert.doesNotMatch(message.text, /\?token=/);
    assert.match(message.text, /poate fi folosit o singură dată/i);
    assert.match(message.text, /Dacă nu ai solicitat/i);
    assert.doesNotMatch(message.text, /userId|\b7\b/);
});

test('configured notifier passes the password reset template through the generic delivery service', async () => {
    const messages = [];
    const notifier = createPasswordResetEmailNotifier({
        emailDeliveryService: {
            isConfigured() { return true; },
            async send(message) {
                messages.push(message);
                return { ok: true, provider: 'test' };
            }
        },
        publicOrigin: 'https://f1guesserduel.onrender.com/',
        requireHttps: true
    });

    assert.deepEqual(await notifier.notify(DELIVERY), { ok: true, provider: 'test' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, DELIVERY.email);
    assert.match(messages[0].text, new RegExp(`#token=${TOKEN}`));
});

test('production password reset links require a clean HTTPS origin', () => {
    assert.equal(
        normalizePublicOrigin('https://f1guesserduel.onrender.com/', { requireHttps: true }),
        'https://f1guesserduel.onrender.com'
    );
    assert.throws(
        () => normalizePublicOrigin('http://f1guesserduel.onrender.com', { requireHttps: true }),
        error => error.code === 'PASSWORD_RESET_EMAIL_HTTPS_REQUIRED'
    );
    for (const origin of [
        'javascript:alert(1)',
        'https://user:pass@example.com',
        'https://example.com/path',
        'https://example.com/?token=leak',
        'https://example.com/#fragment'
    ]) {
        assert.throws(
            () => normalizePublicOrigin(origin),
            error => error.code === 'PASSWORD_RESET_EMAIL_ORIGIN_INVALID'
        );
    }
});

test('password reset URL builder rejects malformed tokens and path injection', () => {
    assert.equal(
        buildPasswordResetUrl({
            publicOrigin: 'https://example.com',
            token: TOKEN
        }),
        `https://example.com/reset-password#token=${TOKEN}`
    );
    assert.throws(
        () => buildPasswordResetUrl({ publicOrigin: 'https://example.com', token: 'short' }),
        error => error.code === 'PASSWORD_RESET_EMAIL_TOKEN_INVALID'
    );
    assert.throws(
        () => buildPasswordResetUrl({
            publicOrigin: 'https://example.com',
            token: TOKEN,
            resetPath: '//attacker.example/reset'
        }),
        error => error.code === 'PASSWORD_RESET_EMAIL_PATH_INVALID'
    );
});
