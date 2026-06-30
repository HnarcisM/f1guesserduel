const {
    normalizeTimeLimitSeconds,
    isValidDifficulty
} = require('../config/constants');

const MAX_DRIVER_ID_LENGTH = 30;
const MAX_USERNAME_LENGTH = 30;
const MAX_USER_ID_LENGTH = 64;
const DRIVER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, maxLength) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) return null;
    return trimmed;
}

function normalizeUserId(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const id = String(value).trim();
    if (!id || id.length > MAX_USER_ID_LENGTH) return null;
    return id;
}

function normalizeClientAuthUser(user) {
    if (!isPlainObject(user)) return null;

    const username = normalizeString(user.username, MAX_USERNAME_LENGTH);
    if (!username) return null;

    return {
        id: normalizeUserId(user.id),
        username,
        email: typeof user.email === 'string' ? user.email.trim().slice(0, 254) : null
    };
}


function normalizeDailyDateKey(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

    const [year, month, day] = trimmed.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return trimmed;
}

function normalizeDriverId(value) {
    const driverId = normalizeString(String(value ?? ''), MAX_DRIVER_ID_LENGTH);
    if (!driverId || !DRIVER_ID_PATTERN.test(driverId)) return null;
    return driverId;
}

function normalizeRoundOptions(payload) {
    const source = isPlainObject(payload) ? payload : { level: payload };
    const difficulty = normalizeString(source.level, 20);

    if (!difficulty || !isValidDifficulty(difficulty)) {
        return null;
    }

    return {
        difficulty,
        daily: source.daily === true,
        timed: source.timed === true,
        timeLimitSeconds: normalizeTimeLimitSeconds(source.timeLimitSeconds),
        dailyDate: normalizeDailyDateKey(source.dailyDate)
    };
}

function normalizeRestartOptions(payload = {}) {
    const source = isPlainObject(payload) ? payload : {};

    return {
        timed: source.timed === true,
        timeLimitSeconds: normalizeTimeLimitSeconds(source.timeLimitSeconds),
        dailyDate: normalizeDailyDateKey(source.dailyDate)
    };
}

module.exports = {
    normalizeClientAuthUser,
    normalizeDriverId,
    normalizeDailyDateKey,
    normalizeRoundOptions,
    normalizeRestartOptions
};
