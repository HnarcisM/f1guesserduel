'use strict';

const { randomUUID } = require('node:crypto');

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const MAX_RESEND_API_KEY_BYTES = 512;
const RESEND_API_KEY_PREFIX = 're_';
const MESSAGE_TYPE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function createResendTransportError(code) {
    const error = new Error('Resend email delivery failed.');
    error.name = 'ResendEmailTransportError';
    error.code = code;
    return error;
}

function normalizeResendApiKey(value) {
    if (typeof value !== 'string') {
        throw new Error('RESEND_API_KEY must be a non-empty Resend API key.');
    }

    const normalized = value.trim();
    if (!normalized.startsWith(RESEND_API_KEY_PREFIX)
        || /[\u0000-\u0020\u007f]/.test(normalized)
        || Buffer.byteLength(normalized, 'utf8') > MAX_RESEND_API_KEY_BYTES) {
        throw new Error('RESEND_API_KEY must be a valid Resend API key.');
    }
    return normalized;
}

function normalizeIdempotencyKey(value) {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
        throw new Error('Resend idempotency key factory returned an invalid value.');
    }
    return normalized;
}


function normalizeMessageType(value) {
    const normalized = String(value || 'transactional').trim().toLowerCase();
    if (!MESSAGE_TYPE_PATTERN.test(normalized)) {
        throw new Error('Resend messageType must contain only lowercase letters, numbers, underscore or dash.');
    }
    return normalized;
}

function createResendEmailTransport({
    apiKey,
    fetchFn = globalThis.fetch,
    idempotencyKeyFactory = randomUUID
} = {}) {
    const normalizedApiKey = normalizeResendApiKey(apiKey);
    if (typeof fetchFn !== 'function') {
        throw new Error('Resend email transport requires a fetch implementation.');
    }
    if (typeof idempotencyKeyFactory !== 'function') {
        throw new Error('Resend email transport requires an idempotency key factory.');
    }

    async function send(message, { signal, messageType = 'transactional' } = {}) {
        const normalizedMessageType = normalizeMessageType(messageType);
        const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyFactory());
        let response;

        try {
            response = await fetchFn(RESEND_EMAILS_ENDPOINT, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${normalizedApiKey}`,
                    'content-type': 'application/json',
                    'idempotency-key': `f1-${normalizedMessageType}-${idempotencyKey}`
                },
                body: JSON.stringify({
                    from: message.from,
                    to: message.to,
                    subject: message.subject,
                    text: message.text
                }),
                signal
            });
        } catch {
            throw createResendTransportError('RESEND_REQUEST_FAILED');
        }

        if (!response || response.ok !== true || typeof response.json !== 'function') {
            throw createResendTransportError('RESEND_RESPONSE_FAILED');
        }

        let payload;
        try {
            payload = await response.json();
        } catch {
            throw createResendTransportError('RESEND_RESPONSE_INVALID');
        }

        if (!payload || typeof payload.id !== 'string' || payload.id.trim().length === 0) {
            throw createResendTransportError('RESEND_RESPONSE_INVALID');
        }

        return { messageId: payload.id.trim() };
    }

    return Object.freeze({
        provider: 'resend',
        send
    });
}

module.exports = {
    MAX_RESEND_API_KEY_BYTES,
    RESEND_EMAILS_ENDPOINT,
    createResendEmailTransport,
    normalizeResendApiKey
};
