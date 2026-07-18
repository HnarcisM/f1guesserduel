const crypto = require('node:crypto');
const { MAX_ATTEMPTS } = require('../config/constants');
const { createAccountStatsRepository } = require('./accountStatsRepository');

const ACCOUNT_GAME_MODES = Object.freeze(['single', 'daily', 'duel']);
const ACCOUNT_GAME_OUTCOMES = Object.freeze(['win', 'loss', 'draw']);
const DEFAULT_ACCOUNT_HISTORY_LIMIT = 10;
const MAX_ACCOUNT_HISTORY_LIMIT = 20;
const XP_LEVEL_SCALE = 100;
const XP_REWARDS = Object.freeze({
    participation: 10,
    outcomes: Object.freeze({ win: 40, draw: 20, loss: 0 }),
    difficulties: Object.freeze({ easy: 0, medium: 5, hard: 10 }),
    modes: Object.freeze({ single: 0, daily: 10, duel: 5 })
});

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

function calculateXpReward(result = {}) {
    return XP_REWARDS.participation
        + (XP_REWARDS.outcomes[result.outcome] || 0)
        + (XP_REWARDS.difficulties[result.difficulty] || 0)
        + (XP_REWARDS.modes[result.mode] || 0);
}

function buildAccountProgress(row = null) {
    const totalXp = asNonNegativeInteger(row?.total_xp ?? row?.totalXp);
    const level = Math.floor(Math.sqrt(totalXp / XP_LEVEL_SCALE)) + 1;
    const levelStartXp = XP_LEVEL_SCALE * ((level - 1) ** 2);
    const nextLevelXp = XP_LEVEL_SCALE * (level ** 2);
    const xpIntoLevel = Math.max(0, totalXp - levelStartXp);
    const xpForLevel = Math.max(1, nextLevelXp - levelStartXp);
    const xpToNextLevel = Math.max(0, nextLevelXp - totalXp);
    const progressPercent = Math.min(100, Math.floor((xpIntoLevel / xpForLevel) * 100));

    return {
        level,
        totalXp,
        levelStartXp,
        nextLevelXp,
        xpIntoLevel,
        xpForLevel,
        xpToNextLevel,
        progressPercent
    };
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

function normalizeHistoryLimit(limit) {
    const value = Number(limit);
    if (!Number.isSafeInteger(value) || value <= 0) return DEFAULT_ACCOUNT_HISTORY_LIMIT;
    return Math.min(value, MAX_ACCOUNT_HISTORY_LIMIT);
}

function buildRecentGames(rows = [], limit = DEFAULT_ACCOUNT_HISTORY_LIMIT) {
    const normalizedLimit = normalizeHistoryLimit(limit);
    return rows
        .filter(row => row
            && ACCOUNT_GAME_MODES.includes(row.mode)
            && ACCOUNT_GAME_OUTCOMES.includes(row.outcome))
        .slice(0, normalizedLimit)
        .map(row => ({
            mode: row.mode,
            outcome: row.outcome,
            attempts: Math.min(MAX_ATTEMPTS, asNonNegativeInteger(row.attempts)),
            difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
            completedAt: row.completedAt || row.completed_at || null
        }));
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

    async function getAccountDashboard(userId, { historyLimit = DEFAULT_ACCOUNT_HISTORY_LIMIT } = {}) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId) throw new Error('Invalid account user id.');
        const normalizedLimit = normalizeHistoryLimit(historyLimit);
        const [rows, recentRows, progressRow] = await Promise.all([
            repository.getStatsRows(normalizedUserId),
            typeof repository.getRecentResults === 'function'
                ? repository.getRecentResults(normalizedUserId, normalizedLimit)
                : [],
            typeof repository.getProgressRow === 'function'
                ? repository.getProgressRow(normalizedUserId)
                : null
        ]);
        return {
            stats: buildAccountStats(rows),
            recentGames: buildRecentGames(recentRows, normalizedLimit),
            progress: buildAccountProgress(progressRow)
        };
    }

    async function recordGameResult(input) {
        const result = normalizeResultInput(input);
        const xpEarned = calculateXpReward(result);
        const repositoryResult = await repository.recordGameResult({ ...result, xpEarned });
        const recorded = Boolean(repositoryResult.recorded);
        return {
            recorded,
            stats: buildAccountStats(repositoryResult.rows),
            recentGames: buildRecentGames(repositoryResult.recentResults),
            progress: buildAccountProgress(repositoryResult.progressRow),
            xpAwarded: recorded ? xpEarned : 0
        };
    }

    return {
        getAccountStats,
        getAccountDashboard,
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
    DEFAULT_ACCOUNT_HISTORY_LIMIT,
    MAX_ACCOUNT_HISTORY_LIMIT,
    XP_LEVEL_SCALE,
    XP_REWARDS,
    buildAccountProgress,
    buildAccountStats,
    buildRecentGames,
    calculateXpReward,
    createAccountStatsService,
    createEmptyModeStats,
    createGameResultKey,
    normalizeResultInput,
    normalizeHistoryLimit,
    recordAccountGameResultSafely
};
