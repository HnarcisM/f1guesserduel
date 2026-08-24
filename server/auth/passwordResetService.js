'use strict';

const crypto = require('node:crypto');
const { hashPassword } = require('./passwordService');
const {
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    normalizeEmail
} = require('./authService');
const { createPasswordResetRepository } = require('./passwordResetRepository');

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_LENGTH = 43;
const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_PASSWORD_RESET_EMAIL_LENGTH = 320;
const INVALID_EMAIL_SENTINEL = '__invalid_password_reset_email__';
const PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE =
    'Dacă există un cont pentru acest email, vei primi instrucțiuni pentru resetarea parolei.';
const PASSWORD_RESET_INVALID_TOKEN_MESSAGE =
    'Linkul de resetare este invalid sau a expirat. Solicită un link nou.';
const PASSWORD_RESET_SUCCESS_MESSAGE =
    'Parola a fost resetată. Autentifică-te din nou cu parola nouă.';

function normalizePasswordResetEmail(email) {
    const normalized = normalizeEmail(email);
    if (
        normalized.length === 0
        || normalized.length > MAX_PASSWORD_RESET_EMAIL_LENGTH
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
        return INVALID_EMAIL_SENTINEL;
    }
    return normalized;
}

function generatePasswordResetToken() {
    return crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
}

function hashPasswordResetToken(token) {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function isValidPasswordResetToken(token) {
    return typeof token === 'string'
        && token.length === PASSWORD_RESET_TOKEN_LENGTH
        && PASSWORD_RESET_TOKEN_PATTERN.test(token);
}

function getPasswordResetEmailRateLimitKey(email) {
    return `email-${crypto
        .createHash('sha256')
        .update(normalizePasswordResetEmail(email), 'utf8')
        .digest('hex')}`;
}

function validateNewPassword(newPassword) {
    return typeof newPassword === 'string'
        && newPassword.length >= MIN_PASSWORD_LENGTH
        && newPassword.length <= MAX_PASSWORD_LENGTH;
}

function createPasswordResetService(databaseOrRepository, options = {}) {
    const repository = createPasswordResetRepository(databaseOrRepository);
    const tokenTtlMs = options.tokenTtlMs ?? PASSWORD_RESET_TOKEN_TTL_MS;
    const clock = options.clock || Date.now;
    const tokenGenerator = options.tokenGenerator || generatePasswordResetToken;

    if (!Number.isFinite(tokenTtlMs) || tokenTtlMs <= 0 || tokenTtlMs > 24 * 60 * 60 * 1000) {
        throw new Error('Password reset token TTL must be between 1 ms and 24 hours.');
    }

    async function requestPasswordReset({ email } = {}) {
        const cleanEmail = normalizePasswordResetEmail(email);
        const token = tokenGenerator();
        if (!isValidPasswordResetToken(token)) {
            throw new Error('Password reset token generator returned an invalid token.');
        }

        const tokenHash = hashPasswordResetToken(token);
        const expiresAt = new Date(clock() + tokenTtlMs).toISOString();
        const issued = await repository.replaceTokenForEmail({
            email: cleanEmail,
            tokenHash,
            expiresAt
        });

        return {
            accepted: true,
            delivery: issued ? {
                userId: issued.userId,
                email: cleanEmail,
                token,
                expiresAt
            } : null
        };
    }

    async function confirmPasswordReset({ token, newPassword } = {}) {
        if (!validateNewPassword(newPassword)) {
            return {
                ok: false,
                status: 400,
                message: `Parola nouă trebuie să aibă între ${MIN_PASSWORD_LENGTH} și ${MAX_PASSWORD_LENGTH} de caractere.`
            };
        }
        if (!isValidPasswordResetToken(token)) {
            return { ok: false, status: 400, message: PASSWORD_RESET_INVALID_TOKEN_MESSAGE };
        }

        const passwordHash = await hashPassword(newPassword);
        const resetResult = await repository.consumeTokenAndResetPassword({
            tokenHash: hashPasswordResetToken(token),
            passwordHash
        });
        if (!resetResult) {
            return { ok: false, status: 400, message: PASSWORD_RESET_INVALID_TOKEN_MESSAGE };
        }

        return {
            ok: true,
            message: PASSWORD_RESET_SUCCESS_MESSAGE,
            sessionsRevoked: resetResult.sessionsRevoked
        };
    }

    return {
        requestPasswordReset,
        confirmPasswordReset,
        tokenTtlMs
    };
}

module.exports = {
    PASSWORD_RESET_INVALID_TOKEN_MESSAGE,
    PASSWORD_RESET_REQUEST_ACCEPTED_MESSAGE,
    PASSWORD_RESET_SUCCESS_MESSAGE,
    PASSWORD_RESET_TOKEN_BYTES,
    PASSWORD_RESET_TOKEN_LENGTH,
    PASSWORD_RESET_TOKEN_PATTERN,
    PASSWORD_RESET_TOKEN_TTL_MS,
    createPasswordResetService,
    generatePasswordResetToken,
    getPasswordResetEmailRateLimitKey,
    hashPasswordResetToken,
    isValidPasswordResetToken,
    normalizePasswordResetEmail,
    validateNewPassword
};
