'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    RESEND_EMAILS_ENDPOINT,
    createResendEmailTransport
} = require('../server/email/resendEmailTransport');

const API_KEY = 're_test_key_1234567890';
const MESSAGE = Object.freeze({
    from: 'support@example.com',
    to: 'driver@example.com',
    subject: 'Resetare parolă F1 Guesser Duel',
    text: 'Reset link.'
});

test('resend transport sends the bounded generic message contract to the fixed HTTPS endpoint', async () => {
    const calls = [];
    const signal = new AbortController().signal;
    const transport = createResendEmailTransport({
        apiKey: API_KEY,
        idempotencyKeyFactory: () => 'fixed-idempotency-key',
        async fetchFn(url, options) {
            calls.push({ url, options });
            return {
                ok: true,
                async json() { return { id: 'resend-message-123' }; }
            };
        }
    });

    const result = await transport.send(MESSAGE, {
        signal,
        messageType: 'password-reset'
    });

    assert.equal(transport.provider, 'resend');
    assert.deepEqual(result, { messageId: 'resend-message-123' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, RESEND_EMAILS_ENDPOINT);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.headers.authorization, `Bearer ${API_KEY}`);
    assert.equal(calls[0].options.headers['content-type'], 'application/json');
    assert.equal(
        calls[0].options.headers['idempotency-key'],
        'f1-password-reset-fixed-idempotency-key'
    );
    assert.deepEqual(JSON.parse(calls[0].options.body), MESSAGE);
});

test('resend transport never forwards provider response bodies or fetch errors', async () => {
    const providerSecret = 'provider-body-with-driver@example.com-and-secret-token';
    const httpFailure = createResendEmailTransport({
        apiKey: API_KEY,
        async fetchFn() {
            return {
                ok: false,
                status: 422,
                async json() { return { message: providerSecret }; }
            };
        }
    });

    await assert.rejects(
        httpFailure.send(MESSAGE),
        error => {
            assert.equal(error.name, 'ResendEmailTransportError');
            assert.equal(error.code, 'RESEND_RESPONSE_FAILED');
            assert.doesNotMatch(error.message, /driver@example\.com|secret-token/);
            assert.doesNotMatch(error.stack || '', /provider-body-with/);
            return true;
        }
    );

    const networkFailure = createResendEmailTransport({
        apiKey: API_KEY,
        async fetchFn() {
            throw new Error(`network failed ${API_KEY} ${providerSecret}`);
        }
    });
    await assert.rejects(
        networkFailure.send(MESSAGE),
        error => error.code === 'RESEND_REQUEST_FAILED'
            && !String(error.stack).includes(API_KEY)
            && !String(error.stack).includes(providerSecret)
    );
});

test('resend transport rejects malformed successful responses', async () => {
    for (const response of [
        { ok: true, async json() { throw new Error('invalid json with secret-token'); } },
        { ok: true, async json() { return {}; } },
        { ok: true, async json() { return { id: '' }; } }
    ]) {
        const transport = createResendEmailTransport({
            apiKey: API_KEY,
            async fetchFn() { return response; }
        });
        await assert.rejects(
            transport.send(MESSAGE),
            error => error.code === 'RESEND_RESPONSE_INVALID'
                && !String(error.stack).includes('secret-token')
        );
    }
});

test('resend transport validates API key, fetch and idempotency configuration before sending', async () => {
    assert.throws(
        () => createResendEmailTransport({ apiKey: 'invalid' }),
        /valid Resend API key/
    );
    assert.throws(
        () => createResendEmailTransport({ apiKey: `${API_KEY}\nAuthorization: bad` }),
        /valid Resend API key/
    );
    assert.throws(
        () => createResendEmailTransport({ apiKey: API_KEY, fetchFn: null }),
        /requires a fetch implementation/
    );

    const transport = createResendEmailTransport({
        apiKey: API_KEY,
        idempotencyKeyFactory: () => 'contains spaces',
        async fetchFn() {
            throw new Error('must not run');
        }
    });
    await assert.rejects(
        transport.send(MESSAGE),
        /idempotency key factory returned an invalid value/
    );

    const messageTypeTransport = createResendEmailTransport({
        apiKey: API_KEY,
        async fetchFn() {
            throw new Error('must not run');
        }
    });
    await assert.rejects(
        messageTypeTransport.send(MESSAGE, { messageType: 'password-reset\r\nX-Bad: 1' }),
        /Resend messageType must contain only/
    );
});
