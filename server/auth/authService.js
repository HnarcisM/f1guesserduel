const { hashPassword, verifyPassword } = require('./passwordService');
const { createAuthRepository } = require('./authRepository');

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const DEFAULT_AVATAR_KEY = 'helmet-red';
const AVATAR_PRESET_KEYS = Object.freeze([
    'helmet-red',
    'helmet-blue',
    'helmet-yellow',
    'helmet-green',
    'helmet-orange',
    'helmet-purple',
    'helmet-cyan',
    'helmet-white'
]);

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
    return String(username || '').trim();
}

function normalizeAvatarKey(avatarKey) {
    const value = String(avatarKey || '').trim().toLowerCase();
    return AVATAR_PRESET_KEYS.includes(value) ? value : null;
}

function sanitizeUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        createdAt: row.createdAt || row.created_at,
        avatarKey: normalizeAvatarKey(row.avatarKey || row.avatar_key) || DEFAULT_AVATAR_KEY
    };
}

function createAuthService(databaseOrRepository, sessionService) {
    const repository = createAuthRepository(databaseOrRepository);

    function validateRegisterInput({ username, email, password }) {
        const cleanUsername = normalizeUsername(username);
        const cleanEmail = normalizeEmail(email);

        if (!USERNAME_REGEX.test(cleanUsername)) {
            return 'Username-ul trebuie să aibă 3-20 caractere și poate conține doar litere, cifre sau underscore.';
        }

        if (!EMAIL_REGEX.test(cleanEmail)) {
            return 'Email-ul nu este valid.';
        }

        if (typeof password !== 'string' || password.length < 8) {
            return 'Parola trebuie să aibă minimum 8 caractere.';
        }

        return null;
    }

    async function register({ username, email, password }) {
        const validationError = validateRegisterInput({ username, email, password });
        if (validationError) {
            return { ok: false, status: 400, message: validationError };
        }

        const cleanUsername = normalizeUsername(username);
        const cleanEmail = normalizeEmail(email);

        try {
            const user = await repository.createUser({
                username: cleanUsername,
                email: cleanEmail,
                passwordHash: await hashPassword(password)
            });

            const session = await sessionService.createSession(user.id);
            return { ok: true, user: sanitizeUser(user), session };
        } catch (error) {
            if (repository.isUniqueConstraintError?.(error)) {
                return { ok: false, status: 409, message: 'Username-ul sau email-ul este deja folosit.' };
            }

            throw error;
        }
    }

    async function login({ email, password }) {
        const cleanEmail = normalizeEmail(email);
        if (!EMAIL_REGEX.test(cleanEmail) || typeof password !== 'string' || password.length === 0) {
            return { ok: false, status: 400, message: 'Email sau parolă invalidă.' };
        }

        const userRow = await repository.findUserByEmail(cleanEmail);
        if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
            return { ok: false, status: 401, message: 'Email sau parolă greșită.' };
        }

        await repository.updateLastSeen(userRow.id);
        const session = await sessionService.createSession(userRow.id);
        return { ok: true, user: sanitizeUser(userRow), session };
    }

    async function getUserById(userId) {
        return sanitizeUser(await repository.findUserById(userId));
    }

    async function verifyCurrentPassword(userId, currentPassword) {
        if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return null;
        if (typeof currentPassword !== 'string' || currentPassword.length === 0) return null;

        const userRow = await repository.findUserCredentialsById(Number(userId));
        if (!userRow || !(await verifyPassword(currentPassword, userRow.password_hash))) return null;
        return userRow;
    }

    async function updateUsername({ userId, username, currentPassword }) {
        const cleanUsername = normalizeUsername(username);
        if (!USERNAME_REGEX.test(cleanUsername)) {
            return {
                ok: false,
                status: 400,
                message: 'Username-ul trebuie să aibă 3-20 caractere și poate conține doar litere, cifre sau underscore.'
            };
        }

        const userRow = await verifyCurrentPassword(userId, currentPassword);
        if (!userRow) {
            return { ok: false, status: 401, message: 'Parola curentă este greșită.' };
        }

        try {
            const updatedUser = await repository.updateUsername(userRow.id, cleanUsername);
            return { ok: true, user: sanitizeUser(updatedUser) };
        } catch (error) {
            if (repository.isUniqueConstraintError?.(error)) {
                return { ok: false, status: 409, message: 'Acest username este deja folosit.' };
            }
            throw error;
        }
    }

    async function updatePassword({ userId, currentPassword, newPassword }) {
        if (typeof newPassword !== 'string'
            || newPassword.length < MIN_PASSWORD_LENGTH
            || newPassword.length > MAX_PASSWORD_LENGTH) {
            return {
                ok: false,
                status: 400,
                message: `Parola nouă trebuie să aibă între ${MIN_PASSWORD_LENGTH} și ${MAX_PASSWORD_LENGTH} de caractere.`
            };
        }

        const userRow = await verifyCurrentPassword(userId, currentPassword);
        if (!userRow) {
            return { ok: false, status: 401, message: 'Parola curentă este greșită.' };
        }
        if (newPassword === currentPassword) {
            return { ok: false, status: 400, message: 'Parola nouă trebuie să fie diferită de parola curentă.' };
        }

        await repository.updatePasswordHash(userRow.id, await hashPassword(newPassword));
        return { ok: true, user: sanitizeUser(userRow) };
    }

    async function updateAvatar({ userId, avatarKey }) {
        const normalizedUserId = Number(userId);
        const cleanAvatarKey = normalizeAvatarKey(avatarKey);
        if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0 || !cleanAvatarKey) {
            return { ok: false, status: 400, message: 'Avatarul selectat nu este valid.' };
        }

        const updatedUser = await repository.updateAvatar(normalizedUserId, cleanAvatarKey);
        if (!updatedUser) {
            return { ok: false, status: 404, message: 'Contul nu a fost găsit.' };
        }
        return { ok: true, user: sanitizeUser(updatedUser) };
    }

    return {
        register,
        login,
        getUserById,
        updateUsername,
        updatePassword,
        updateAvatar
    };
}

module.exports = {
    createAuthService,
    normalizeEmail,
    normalizeUsername,
    normalizeAvatarKey,
    sanitizeUser,
    AVATAR_PRESET_KEYS,
    DEFAULT_AVATAR_KEY,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH
};
