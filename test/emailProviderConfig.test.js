'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_EMAIL_PROVIDER,
    createEmailProviderConfig,
    normalizeEmailProvider,
    parseEmailDeliveryTimeoutMs
} = require('../server/email/emailProviderConfig');

const API_KEY = 're_test_key_1234567890';

function enabledEnv(overrides = {}) {
    return {
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM: 'support@example.com',
        PUBLIC_ORIGIN: 'https://f1guesserduel.onrender.com',
        RESEND_API_KEY: API_KEY,
        ...overrides
    };
}

test('email delivery is disabled by default without requiring provider secrets', () => {
    const config = createEmailProviderConfig({});

    assert.equal(DEFAULT_EMAIL_PROVIDER, 'disabled');
    assert.deepEqual(config, {
        enabled: false,
        provider: 'disabled',
        from: null,
        publicOrigin: null,
        timeoutMs: 5_000,
        resend: { apiKey: null }
    });
});

test('resend config requires sender, public origin and API key only when enabled', () => {
    assert.throws(
        () => createEmailProviderConfig({ EMAIL_PROVIDER: 'resend' }),
        /EMAIL_FROM must be set/
    );
    assert.throws(
        () => createEmailProviderConfig({
            EMAIL_PROVIDER: 'resend',
            EMAIL_FROM: 'support@example.com'
        }),
        /PUBLIC_ORIGIN must be set/
    );
    assert.throws(
        () => createEmailProviderConfig({
            EMAIL_PROVIDER: 'resend',
            EMAIL_FROM: 'support@example.com',
            PUBLIC_ORIGIN: 'https://example.com'
        }),
        /RESEND_API_KEY must be set/
    );
});

test('resend config normalizes safe values and keeps the secret out of top-level fields', () => {
    const config = createEmailProviderConfig(enabledEnv({
        EMAIL_PROVIDER: ' ReSeNd ',
        EMAIL_DELIVERY_TIMEOUT_MS: '7000'
    }), { isProduction: true });

    assert.equal(config.enabled, true);
    assert.equal(config.provider, 'resend');
    assert.equal(config.from, 'support@example.com');
    assert.equal(config.publicOrigin, 'https://f1guesserduel.onrender.com');
    assert.equal(config.timeoutMs, 7_000);
    assert.equal(config.resend.apiKey, API_KEY);
    assert.equal(Object.hasOwn(config, 'apiKey'), false);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.resend), true);
});

test('production email delivery rejects non-HTTPS public origins', () => {
    assert.throws(
        () => createEmailProviderConfig(enabledEnv({
            PUBLIC_ORIGIN: 'http://f1guesserduel.onrender.com'
        }), { isProduction: true }),
        /clean HTTPS origin/
    );

    assert.equal(
        createEmailProviderConfig(enabledEnv({
            PUBLIC_ORIGIN: 'http://localhost:3000'
        })).publicOrigin,
        'http://localhost:3000'
    );
});

test('email config rejects unsafe sender, provider, API key and timeout values', () => {
    assert.throws(
        () => createEmailProviderConfig(enabledEnv({
            EMAIL_FROM: 'sender@example.com\r\nBcc: attacker@example.com'
        })),
        /EMAIL_FROM must be a valid plain email address/
    );
    assert.throws(
        () => createEmailProviderConfig(enabledEnv({ RESEND_API_KEY: 'not-a-resend-key' })),
        /RESEND_API_KEY must be a valid Resend API key/
    );
    assert.throws(
        () => createEmailProviderConfig({ EMAIL_PROVIDER: 'smtp' }),
        /EMAIL_PROVIDER must be one of/
    );
    assert.throws(
        () => createEmailProviderConfig({ EMAIL_DELIVERY_TIMEOUT_MS: '499' }),
        /EMAIL_DELIVERY_TIMEOUT_MS must be an integer/
    );
    assert.equal(normalizeEmailProvider(undefined), 'disabled');
    assert.equal(parseEmailDeliveryTimeoutMs(undefined), 5_000);
});
