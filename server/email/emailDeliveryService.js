'use strict';

const DEFAULT_EMAIL_DELIVERY_TIMEOUT_MS = 5_000;
const MAX_EMAIL_ADDRESS_BYTES = 320;
const MAX_EMAIL_SUBJECT_BYTES = 200;
const MAX_EMAIL_TEXT_BYTES = 64 * 1024;
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MESSAGE_TYPE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function createEmailDeliveryError(code, message = 'Email delivery failed.') {
    const error = new Error(message);
    error.name = 'EmailDeliveryError';
    error.code = code;
    return error;
}

function hasUnsafeHeaderCharacters(value) {
    return /[\u0000-\u001f\u007f]/.test(value);
}

function validateEmailAddress(value) {
    if (typeof value !== 'string') {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }

    const normalized = value.trim();
    if (!normalized
        || hasUnsafeHeaderCharacters(normalized)
        || Buffer.byteLength(normalized, 'utf8') > MAX_EMAIL_ADDRESS_BYTES
        || !EMAIL_ADDRESS_PATTERN.test(normalized)) {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }
    return normalized;
}

function validateSubject(value) {
    if (typeof value !== 'string') {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }

    const normalized = value.trim();
    if (!normalized
        || hasUnsafeHeaderCharacters(normalized)
        || Buffer.byteLength(normalized, 'utf8') > MAX_EMAIL_SUBJECT_BYTES) {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }
    return normalized;
}

function validateText(value) {
    if (typeof value !== 'string'
        || value.length === 0
        || Buffer.byteLength(value, 'utf8') > MAX_EMAIL_TEXT_BYTES) {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }
    return value;
}

function normalizeMessageType(value) {
    const normalized = String(value || 'transactional').trim().toLowerCase();
    if (!MESSAGE_TYPE_PATTERN.test(normalized)) {
        throw createEmailDeliveryError('EMAIL_DELIVERY_INVALID_MESSAGE', 'Email message is invalid.');
    }
    return normalized;
}

function normalizeProviderName(value) {
    const normalized = String(value || '').trim();
    return SAFE_PROVIDER_PATTERN.test(normalized) ? normalized.toLowerCase() : 'custom';
}

function normalizeMessageId(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || hasUnsafeHeaderCharacters(normalized) || Buffer.byteLength(normalized, 'utf8') > 200) {
        return null;
    }
    return normalized;
}

function validateTimeoutMs(value) {
    if (!Number.isInteger(value) || value < 100 || value > 120_000) {
        throw new Error('Email delivery timeoutMs must be an integer between 100 and 120000.');
    }
    return value;
}

function createEmailDeliveryService({
    transport = null,
    defaultFrom = null,
    timeoutMs = DEFAULT_EMAIL_DELIVERY_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
} = {}) {
    validateTimeoutMs(timeoutMs);

    if (transport !== null && (typeof transport !== 'object' || typeof transport.send !== 'function')) {
        throw new Error('Email transport must expose an async send(message, options) function.');
    }

    const configured = Boolean(transport);
    const provider = configured ? normalizeProviderName(transport.provider) : null;
    const from = configured ? validateEmailAddress(defaultFrom) : null;

    function isConfigured() {
        return configured;
    }

    async function send({
        to,
        subject,
        text,
        messageType = 'transactional'
    } = {}) {
        if (!configured) {
            return {
                ok: false,
                skipped: true,
                reason: 'not-configured',
                provider: null,
                messageId: null
            };
        }

        const normalizedMessageType = normalizeMessageType(messageType);
        const message = Object.freeze({
            from,
            to: validateEmailAddress(to),
            subject: validateSubject(subject),
            text: validateText(text)
        });
        const abortController = new AbortController();
        let timeoutHandle = null;

        const timeoutPromise = new Promise((resolve, reject) => {
            timeoutHandle = setTimeoutFn(() => {
                abortController.abort();
                reject(createEmailDeliveryError('EMAIL_DELIVERY_TIMEOUT'));
            }, timeoutMs);
        });

        try {
            const result = await Promise.race([
                Promise.resolve().then(() => transport.send(message, {
                    signal: abortController.signal,
                    messageType: normalizedMessageType
                })),
                timeoutPromise
            ]);

            return {
                ok: true,
                skipped: false,
                provider,
                messageId: normalizeMessageId(result?.messageId || result?.id)
            };
        } catch (error) {
            if (error?.code === 'EMAIL_DELIVERY_TIMEOUT') throw error;
            throw createEmailDeliveryError('EMAIL_DELIVERY_FAILED');
        } finally {
            if (timeoutHandle !== null) clearTimeoutFn(timeoutHandle);
        }
    }

    return Object.freeze({
        isConfigured,
        provider,
        send,
        timeoutMs
    });
}

module.exports = {
    DEFAULT_EMAIL_DELIVERY_TIMEOUT_MS,
    MAX_EMAIL_ADDRESS_BYTES,
    MAX_EMAIL_SUBJECT_BYTES,
    MAX_EMAIL_TEXT_BYTES,
    createEmailDeliveryError,
    createEmailDeliveryService,
    normalizeMessageType,
    validateEmailAddress
};
