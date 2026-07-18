const crypto = require('node:crypto');
const { MAX_ATTEMPTS } = require('../config/constants');
const { createAccountStatsRepository } = require('./accountStatsRepository');

const ACCOUNT_GAME_MODES = Object.freeze(['single', 'daily', 'duel']);
const ACCOUNT_GAME_OUTCOMES = Object.freeze(['win', 'loss', 'draw']);

function createEmptyModeStats(mode) {
    return {
        mode,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        winRate: 0,
        currentStreak: 0,
        bestStreak: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    };
}

function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function normalizeModeStats(row) {
    const stats = createEmptyModeStats(row.mode);
    stats.played = asNonNegativeInteger(row.games_played);
    stats.won = asNonNegativeInteger(row.games_won);
    stats.drawn = asNonNegativeInteger(row.games_drawn);
    stats.lost = Math.max(0, stats.played - stats.won - stats.drawn);
    stats.winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    stats.currentStreak = asNonNegativeInteger(row.current_streak);
    stats.bestStreak = asNonNegativeInteger(row.best_streak);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        stats.distribution[attempt] = asNonNegativeInteger(row[`guess_${attempt}`]);
    }
    return stats;
}

function buildAccountStats(rows = []) {
    const modes = Object.fromEntries(ACCOUNT_GAME_MODES.map(mode => [mode, createEmptyModeStats(mode)]));

    for (const row of rows) {
        if (row && ACCOUNT_GAME_MODES.includes(row.mode)) {
            modes[row.mode] = normalizeModeStats(row);
        }
    }

    const modeValues = Object.values(modes);
    const played = modeValues.reduce((total, mode) => total + mode.played, 0);
    const won = modeValues.reduce((total, mode) => total + mode.won, 0);
    const drawn = modeValues.reduce((total, mode) => total + mode.drawn, 0);

    return {
        totals: {
            played,
            won,
            drawn,
            lost: Math.max(0, played - won - drawn),
            winRate: played > 0 ? Math.round((won / played) * 100) : 0,
            bestStreak: Math.max(0, ...modeValues.map(mode => mode.bestStreak))
        },
        modes
    };
}

function normalizeUserId(userId) {
    const value = Number(userId);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeResultInput(input = {}) {
    const userId = normalizeUserId(input.userId);
    const mode = ACCOUNT_GAME_MODES.includes(input.mode) ? input.mode : null;
    const outcome = ACCOUNT_GAME_OUTCOMES.includes(input.outcome) ? input.outcome : null;
    const attempts = Number(input.attempts);
    const resultKey = typeof input.resultKey === 'string' ? input.resultKey.trim() : '';
    const difficulty = typeof input.difficulty === 'string' && input.difficulty.length <= 30
        ? input.difficulty
        : null;

    if (!userId || !mode || !outcome || !resultKey || resultKey.length > 200) {
        throw new Error('Invalid account game result.');
    }
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > MAX_ATTEMPTS) {
        throw new Error('Invalid account game attempts.');
    }

    return { userId, mode, outcome, attempts, resultKey, difficulty };
}

function createGameResultKey(prefix = 'game') {
    return `${prefix}:${crypto.randomUUID()}`;
}

function createAccountStatsService(databaseOrRepository) {
    const repository = createAccountStatsRepository(databaseOrRepository);

    async function getAccountStats(userId) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId) throw new Error('Invalid account user id.');
        return buildAccountStats(await repository.getStatsRows(normalizedUserId));
    }

    async function recordGameResult(input) {
        const result = normalizeResultInput(input);
        const repositoryResult = await repository.recordGameResult(result);
        return {
            recorded: Boolean(repositoryResult.recorded),
            stats: buildAccountStats(repositoryResult.rows)
        };
    }

    return {
        getAccountStats,
        recordGameResult
    };
}

async function recordAccountGameResultSafely({ accountStatsService, logger = console, ...result }) {
    if (!accountStatsService || result.userId == null) return null;

    try {
        return await accountStatsService.recordGameResult(result);
    } catch (error) {
        logger?.error?.('Account statistics update failed.', {
            error,
            mode: result.mode,
            outcome: result.outcome
        });
        return null;
    }
}

module.exports = {
    ACCOUNT_GAME_MODES,
    ACCOUNT_GAME_OUTCOMES,
    buildAccountStats,
    createAccountStatsService,
    createEmptyModeStats,
    createGameResultKey,
    normalizeResultInput,
    recordAccountGameResultSafely
};
