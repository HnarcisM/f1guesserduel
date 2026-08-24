'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    MAX_EMAIL_TEXT_BYTES,
    createEmailDeliveryService
} = require('../server/email/emailDeliveryService');

const FROM = 'no-reply@example.com';
const TO = 'driver@example.com';

function createMessage(overrides = {}) {
    return {
        to: TO,
        subject: 'F1 Guesser Duel',
        text: 'Mesaj tranzacțional.',
        messageType: 'password-reset',
        ...overrides
    };
}

test('unconfigured email delivery skips safely without validating or exposing a provider', async () => {
    const service = createEmailDeliveryService();

    assert.equal(service.isConfigured(), false);
    assert.deepEqual(await service.send({}), {
        ok: false,
        skipped: true,
        reason: 'not-configured',
        provider: null,
        messageId: null
    });
});

test('configured delivery passes only the bounded message contract and abort signal to transport', async () => {
    const calls = [];
    const service = createEmailDeliveryService({
        transport: {
            provider: 'Test-Provider',
            async send(message, options) {
                calls.push({ message, options });
                return { messageId: 'message-123', rawResponse: 'must-not-escape' };
            }
        },
        defaultFrom: FROM,
        timeoutMs: 1_000
    });

    const result = await service.send(createMessage());

    assert.equal(service.isConfigured(), true);
    assert.equal(service.provider, 'test-provider');
    assert.deepEqual(result, {
        ok: true,
        skipped: false,
        provider: 'test-provider',
        messageId: 'message-123'
    });
    assert.deepEqual(calls[0].message, {
        from: FROM,
        to: TO,
        subject: 'F1 Guesser Duel',
        text: 'Mesaj tranzacțional.'
    });
    assert.equal(calls[0].options.messageType, 'password-reset');
    assert.equal(calls[0].options.signal instanceof AbortSignal, true);
    assert.equal(Object.isFrozen(calls[0].message), true);
});

test('configured delivery rejects header injection and oversized content before transport', async () => {
    let calls = 0;
    const service = createEmailDeliveryService({
        transport: {
            async send() { calls += 1; }
        },
        defaultFrom: FROM
    });

    await assert.rejects(
        service.send(createMessage({ to: 'victim@example.com\r\nBcc: attacker@example.com' })),
        error => error.code === 'EMAIL_DELIVERY_INVALID_MESSAGE'
    );
    await assert.rejects(
        service.send(createMessage({ subject: 'Reset\nBcc: attacker@example.com' })),
        error => error.code === 'EMAIL_DELIVERY_INVALID_MESSAGE'
    );
    await assert.rejects(
        service.send(createMessage({ text: 'x'.repeat(MAX_EMAIL_TEXT_BYTES + 1) })),
        error => error.code === 'EMAIL_DELIVERY_INVALID_MESSAGE'
    );
    assert.equal(calls, 0);
});

test('configured delivery rejects invalid sender configuration at startup', () => {
    assert.throws(
        () => createEmailDeliveryService({
            transport: { async send() {} },
            defaultFrom: 'sender@example.com\r\nBcc: attacker@example.com'
        }),
        error => error.code === 'EMAIL_DELIVERY_INVALID_MESSAGE'
    );
    assert.throws(
        () => createEmailDeliveryService({
            transport: { async send() {} },
            defaultFrom: 'sender\u0000@example.com'
        }),
        error => error.code === 'EMAIL_DELIVERY_INVALID_MESSAGE'
    );
});

test('transport failures are replaced with a sanitized error without recipient or provider payload', async () => {
    const service = createEmailDeliveryService({
        transport: {
            provider: 'test',
            async send() {
                throw new Error('provider failed for driver@example.com token=secret-token');
            }
        },
        defaultFrom: FROM
    });

    await assert.rejects(
        service.send(createMessage()),
        error => {
            assert.equal(error.name, 'EmailDeliveryError');
            assert.equal(error.code, 'EMAIL_DELIVERY_FAILED');
            assert.equal(error.message, 'Email delivery failed.');
            assert.doesNotMatch(error.stack || '', /driver@example\.com|secret-token/);
            assert.equal(Object.hasOwn(error, 'cause'), false);
            return true;
        }
    );
});

test('delivery timeout aborts cooperative transports and returns a sanitized timeout error', async () => {
    let observedSignal = null;
    const service = createEmailDeliveryService({
        transport: {
            provider: 'slow-provider',
            send(message, { signal }) {
                observedSignal = signal;
                return new Promise(() => {});
            }
        },
        defaultFrom: FROM,
        timeoutMs: 100
    });

    await assert.rejects(
        service.send(createMessage()),
        error => error.name === 'EmailDeliveryError'
            && error.code === 'EMAIL_DELIVERY_TIMEOUT'
            && error.message === 'Email delivery failed.'
    );
    assert.equal(observedSignal.aborted, true);
});

test('invalid transport and timeout configuration fail fast', () => {
    assert.throws(
        () => createEmailDeliveryService({ transport: {} }),
        /transport must expose an async send/
    );
    assert.throws(
        () => createEmailDeliveryService({ timeoutMs: 99 }),
        /timeoutMs must be an integer/
    );
});
