const {
    normalizeTimeLimitSeconds,
    isValidDifficulty
} = require('../config/constants');
const { DUEL_BEST_OF_OPTIONS } = require('../rooms/duelMatchService');

const MAX_DRIVER_ID_LENGTH = 30;
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

    const bestOf = source.bestOf === undefined || source.bestOf === null
        ? null
        : Number(source.bestOf);
    if (bestOf !== null && !DUEL_BEST_OF_OPTIONS.includes(bestOf)) return null;

    return {
        difficulty,
        daily: source.daily === true,
        timed: source.timed === true,
        timeLimitSeconds: normalizeTimeLimitSeconds(source.timeLimitSeconds),
        dailyDate: normalizeDailyDateKey(source.dailyDate),
        bestOf
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
    normalizeDriverId,
    normalizeDailyDateKey,
    normalizeRoundOptions,
    normalizeRestartOptions
};
