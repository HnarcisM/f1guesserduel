'use strict';

const {
    DEFAULT_EMAIL_DELIVERY_TIMEOUT_MS,
    validateEmailAddress
} = require('./emailDeliveryService');
const { normalizePublicOrigin } = require('./passwordResetEmailNotifier');
const { normalizeResendApiKey } = require('./resendEmailTransport');

const DEFAULT_EMAIL_PROVIDER = 'disabled';
const ALLOWED_EMAIL_PROVIDERS = new Set(['disabled', 'resend']);

function getOptionalEnvString(env, name) {
    const value = env[name];
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${name} must not be empty.`);
    }
    return value.trim();
}

function normalizeEmailProvider(value) {
    if (value === undefined || value === null || value === '') return DEFAULT_EMAIL_PROVIDER;
    if (typeof value !== 'string') throw new Error('EMAIL_PROVIDER must be a string.');

    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_EMAIL_PROVIDERS.has(normalized)) {
        throw new Error('EMAIL_PROVIDER must be one of: disabled, resend.');
    }
    return normalized;
}

function parseEmailDeliveryTimeoutMs(value) {
    if (value === undefined || value === null || value === '') {
        return DEFAULT_EMAIL_DELIVERY_TIMEOUT_MS;
    }

    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error('EMAIL_DELIVERY_TIMEOUT_MS must be an integer between 500 and 30000.');
    }
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 30_000) {
        throw new Error('EMAIL_DELIVERY_TIMEOUT_MS must be an integer between 500 and 30000.');
    }
    return parsed;
}

function normalizeEmailFrom(value) {
    if (!value) throw new Error('EMAIL_FROM must be set when email delivery is enabled.');
    try {
        return validateEmailAddress(value);
    } catch {
        throw new Error('EMAIL_FROM must be a valid plain email address.');
    }
}

function normalizeEmailPublicOrigin(value, { requireHttps }) {
    if (!value) throw new Error('PUBLIC_ORIGIN must be set when email delivery is enabled.');
    try {
        return normalizePublicOrigin(value, { requireHttps });
    } catch {
        throw new Error(requireHttps
            ? 'PUBLIC_ORIGIN must be a clean HTTPS origin when email delivery is enabled in production.'
            : 'PUBLIC_ORIGIN must be a clean HTTP(S) origin when email delivery is enabled.');
    }
}

function createEmailProviderConfig(env = process.env, { isProduction = false } = {}) {
    const provider = normalizeEmailProvider(env.EMAIL_PROVIDER);
    const timeoutMs = parseEmailDeliveryTimeoutMs(env.EMAIL_DELIVERY_TIMEOUT_MS);

    if (provider === 'disabled') {
        return Object.freeze({
            enabled: false,
            provider,
            from: null,
            publicOrigin: null,
            timeoutMs,
            resend: Object.freeze({ apiKey: null })
        });
    }

    const from = normalizeEmailFrom(getOptionalEnvString(env, 'EMAIL_FROM'));
    const publicOrigin = normalizeEmailPublicOrigin(
        getOptionalEnvString(env, 'PUBLIC_ORIGIN'),
        { requireHttps: isProduction }
    );
    const apiKeyValue = getOptionalEnvString(env, 'RESEND_API_KEY');
    if (!apiKeyValue) {
        throw new Error('RESEND_API_KEY must be set when EMAIL_PROVIDER=resend.');
    }
    const apiKey = normalizeResendApiKey(apiKeyValue);

    return Object.freeze({
        enabled: true,
        provider,
        from,
        publicOrigin,
        timeoutMs,
        resend: Object.freeze({ apiKey })
    });
}

module.exports = {
    DEFAULT_EMAIL_PROVIDER,
    createEmailProviderConfig,
    normalizeEmailProvider,
    parseEmailDeliveryTimeoutMs
};
