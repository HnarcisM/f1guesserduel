'use strict';

const PASSWORD_RESET_EMAIL_SUBJECT = 'Resetare parolă F1 Guesser Duel';
const PASSWORD_RESET_PATH = '/reset-password';
const PASSWORD_RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function createPasswordResetEmailError(code, message = 'Password reset email is invalid.') {
    const error = new Error(message);
    error.name = 'PasswordResetEmailError';
    error.code = code;
    return error;
}

function normalizePublicOrigin(value, { requireHttps = false } = {}) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_ORIGIN_REQUIRED');
    }

    let parsed;
    try {
        parsed = new URL(value.trim());
    } catch {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_ORIGIN_INVALID');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)
        || !parsed.hostname
        || parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash
        || parsed.pathname !== '/') {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_ORIGIN_INVALID');
    }
    if (requireHttps && parsed.protocol !== 'https:') {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_HTTPS_REQUIRED');
    }

    return parsed.origin;
}

function normalizeResetPath(value) {
    if (typeof value !== 'string'
        || !value.startsWith('/')
        || value.startsWith('//')
        || value.includes('?')
        || value.includes('#')
        || /[\r\n]/.test(value)) {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_PATH_INVALID');
    }
    return value;
}

function normalizeResetToken(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!PASSWORD_RESET_TOKEN_PATTERN.test(normalized)) {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_TOKEN_INVALID');
    }
    return normalized;
}

function normalizeExpiry(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
        throw createPasswordResetEmailError('PASSWORD_RESET_EMAIL_EXPIRY_INVALID');
    }
    return new Date(timestamp);
}

function formatExpiry(expiry) {
    return new Intl.DateTimeFormat('ro-RO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Bucharest'
    }).format(expiry);
}

function buildPasswordResetUrl({
    publicOrigin,
    token,
    resetPath = PASSWORD_RESET_PATH,
    requireHttps = false
}) {
    const origin = normalizePublicOrigin(publicOrigin, { requireHttps });
    const normalizedPath = normalizeResetPath(resetPath);
    const normalizedToken = normalizeResetToken(token);
    const url = new URL(normalizedPath, `${origin}/`);

    // Keep the secret in the fragment: URL fragments are not sent in HTTP requests or Referer headers.
    url.hash = new URLSearchParams({ token: normalizedToken }).toString();
    return url.toString();
}

function buildPasswordResetEmail({
    email,
    token,
    expiresAt,
    publicOrigin,
    resetPath = PASSWORD_RESET_PATH,
    requireHttps = false
}) {
    const expiry = normalizeExpiry(expiresAt);
    const resetUrl = buildPasswordResetUrl({
        publicOrigin,
        token,
        resetPath,
        requireHttps
    });

    return {
        to: email,
        subject: PASSWORD_RESET_EMAIL_SUBJECT,
        text: [
            'Ai solicitat resetarea parolei pentru F1 Guesser Duel.',
            '',
            'Deschide linkul de mai jos pentru a seta o parolă nouă:',
            resetUrl,
            '',
            `Linkul poate fi folosit o singură dată și expiră la ${formatExpiry(expiry)}.`,
            '',
            'Dacă nu ai solicitat resetarea parolei, poți ignora acest mesaj.'
        ].join('\n'),
        messageType: 'password-reset'
    };
}

function createPasswordResetEmailNotifier({
    emailDeliveryService,
    publicOrigin = null,
    resetPath = PASSWORD_RESET_PATH,
    requireHttps = false
} = {}) {
    if (!emailDeliveryService
        || typeof emailDeliveryService.send !== 'function'
        || typeof emailDeliveryService.isConfigured !== 'function') {
        throw new Error('Password reset email notifier requires an email delivery service.');
    }

    const configured = emailDeliveryService.isConfigured();
    const normalizedResetPath = normalizeResetPath(resetPath);
    const normalizedPublicOrigin = configured
        ? normalizePublicOrigin(publicOrigin, { requireHttps })
        : null;

    async function notify(delivery) {
        if (!configured) {
            return {
                ok: false,
                skipped: true,
                reason: 'email-not-configured'
            };
        }

        const message = buildPasswordResetEmail({
            email: delivery?.email,
            token: delivery?.token,
            expiresAt: delivery?.expiresAt,
            publicOrigin: normalizedPublicOrigin,
            resetPath: normalizedResetPath,
            requireHttps
        });
        return emailDeliveryService.send(message);
    }

    return Object.freeze({ notify });
}

module.exports = {
    PASSWORD_RESET_EMAIL_SUBJECT,
    PASSWORD_RESET_PATH,
    buildPasswordResetEmail,
    buildPasswordResetUrl,
    createPasswordResetEmailNotifier,
    normalizePublicOrigin
};
