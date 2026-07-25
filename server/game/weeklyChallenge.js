'use strict';

const WEEKLY_CHALLENGE_VERSION = 'f1-weekly-v2';
const WEEKLY_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
const WEEKLY_KEY_PATTERN = /^\d{4}-W\d{2}$/;

function getIsoWeekInfo(dateInput = new Date()) {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return getIsoWeekInfo(new Date());

    const utcDate = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
    const dayNumber = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);

    const year = utcDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

    return {
        year,
        week,
        key: `${year}-W${String(week).padStart(2, '0')}`
    };
}

function getNextWeeklyResetAt(dateInput = new Date()) {
    const date = new Date(dateInput);
    const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const utcDay = validDate.getUTCDay() || 7;
    const daysUntilNextMonday = 8 - utcDay;

    return new Date(Date.UTC(
        validDate.getUTCFullYear(),
        validDate.getUTCMonth(),
        validDate.getUTCDate() + daysUntilNextMonday
    )).toISOString();
}

function normalizeWeeklyDifficulty(value) {
    const difficulty = String(value || '').trim().toLowerCase();
    return WEEKLY_DIFFICULTIES.includes(difficulty) ? difficulty : null;
}

function getWeeklyChallengeId(difficulty, dateInput = new Date()) {
    const normalizedDifficulty = normalizeWeeklyDifficulty(difficulty);
    if (!normalizedDifficulty) return null;
    const weekKey = getIsoWeekInfo(dateInput).key;
    return `${WEEKLY_CHALLENGE_VERSION}:${weekKey}:${normalizedDifficulty}`;
}

module.exports = {
    WEEKLY_CHALLENGE_VERSION,
    WEEKLY_DIFFICULTIES,
    WEEKLY_KEY_PATTERN,
    getIsoWeekInfo,
    getNextWeeklyResetAt,
    getWeeklyChallengeId,
    normalizeWeeklyDifficulty
};
