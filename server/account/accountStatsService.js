const crypto = require('node:crypto');
const { MAX_ATTEMPTS } = require('../config/constants');
const { createAccountStatsRepository } = require('./accountStatsRepository');

const ACCOUNT_GAME_MODES = Object.freeze(['single', 'daily', 'duel']);
const ACCOUNT_GAME_OUTCOMES = Object.freeze(['win', 'loss', 'draw']);
const DAILY_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
const DAILY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ACCOUNT_HISTORY_LIMIT = 10;
const MAX_ACCOUNT_HISTORY_LIMIT = 20;
const XP_LEVEL_SCALE = 100;
const XP_REWARDS = Object.freeze({
    participation: 10,
    outcomes: Object.freeze({ win: 40, draw: 20, loss: 0 }),
    difficulties: Object.freeze({ easy: 0, medium: 5, hard: 10 }),
    modes: Object.freeze({ single: 0, daily: 10, duel: 5 })
});
const ACCOUNT_ACHIEVEMENT_DEFINITIONS = Object.freeze([
    Object.freeze({
        key: 'first-lap', title: 'Primul tur', description: 'Finalizează primul joc.',
        icon: '🏁', metric: 'played', target: 1
    }),
    Object.freeze({
        key: 'first-win', title: 'Prima victorie', description: 'Câștigă primul joc.',
        icon: '🏆', metric: 'won', target: 1
    }),
    Object.freeze({
        key: 'pole-position', title: 'Pole Position',
        description: 'Ghicește pilotul din prima încercare.',
        icon: '⚡', metric: 'firstAttemptWins', target: 1
    }),
    Object.freeze({
        key: 'hat-trick', title: 'Hat-trick', description: 'Obține 3 victorii.',
        icon: '3', metric: 'won', target: 3
    }),
    Object.freeze({
        key: 'daily-regular', title: 'Rutina Daily',
        description: 'Finalizează 5 provocări Daily.',
        icon: '◷', metric: 'dailyPlayed', target: 5
    }),
    Object.freeze({
        key: 'duel-contender', title: 'Duelist', description: 'Joacă 5 dueluri online.',
        icon: 'VS', metric: 'duelPlayed', target: 5
    }),
    Object.freeze({
        key: 'hot-streak', title: 'În formă',
        description: 'Atinge un streak de 3 victorii.',
        icon: '🔥', metric: 'bestStreak', target: 3
    }),
    Object.freeze({
        key: 'xp-500', title: 'Clubul 500', description: 'Acumulează 500 XP.',
        icon: '★', metric: 'totalXp', target: 500
    })
]);

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

function buildAccountAchievements(stats = buildAccountStats(), progress = buildAccountProgress()) {
    const firstAttemptWins = Object.values(stats.modes || {}).reduce(
        (total, mode) => total + asNonNegativeInteger(mode?.distribution?.[1]),
        0
    );
    const metrics = {
        played: asNonNegativeInteger(stats.totals?.played),
        won: asNonNegativeInteger(stats.totals?.won),
        firstAttemptWins,
        dailyPlayed: asNonNegativeInteger(stats.modes?.daily?.played),
        duelPlayed: asNonNegativeInteger(stats.modes?.duel?.played),
        bestStreak: asNonNegativeInteger(stats.totals?.bestStreak),
        totalXp: asNonNegativeInteger(progress.totalXp)
    };

    return ACCOUNT_ACHIEVEMENT_DEFINITIONS.map(definition => {
        const current = metrics[definition.metric] || 0;
        return {
            key: definition.key,
            title: definition.title,
            description: definition.description,
            icon: definition.icon,
            current,
            target: definition.target,
            unlocked: current >= definition.target,
            progressPercent: Math.min(100, Math.floor((current / definition.target) * 100))
        };
    });
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

function normalizeDailyAttemptInput(input = {}) {
    const userId = normalizeUserId(input.userId);
    const challengeId = typeof input.challengeId === 'string' ? input.challengeId.trim() : '';
    const dailyDate = typeof input.dailyDate === 'string' ? input.dailyDate.trim() : '';
    const difficulty = DAILY_DIFFICULTIES.includes(input.difficulty) ? input.difficulty : null;

    if (!userId || !challengeId || challengeId.length > 200 || !DAILY_DATE_PATTERN.test(dailyDate) || !difficulty) {
        throw new Error('Invalid Daily Challenge attempt.');
    }

    return { userId, challengeId, dailyDate, difficulty };
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
        const stats = buildAccountStats(rows);
        const progress = buildAccountProgress(progressRow);
        return {
            stats,
            recentGames: buildRecentGames(recentRows, normalizedLimit),
            progress,
            achievements: buildAccountAchievements(stats, progress)
        };
    }

    async function recordGameResult(input) {
        const result = normalizeResultInput(input);
        const xpEarned = calculateXpReward(result);
        const repositoryResult = await repository.recordGameResult({ ...result, xpEarned });
        const recorded = Boolean(repositoryResult.recorded);
        const stats = buildAccountStats(repositoryResult.rows);
        const progress = buildAccountProgress(repositoryResult.progressRow);
        return {
            recorded,
            stats,
            recentGames: buildRecentGames(repositoryResult.recentResults),
            progress,
            achievements: buildAccountAchievements(stats, progress),
            xpAwarded: recorded ? xpEarned : 0
        };
    }

    async function claimDailyChallenge(input) {
        if (typeof repository.claimDailyAttempt !== 'function') {
            throw new Error('Daily Challenge persistence is unavailable.');
        }
        return repository.claimDailyAttempt(normalizeDailyAttemptInput(input));
    }

    async function getDailyChallengeStatus(userId, dailyDate) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId || typeof dailyDate !== 'string' || !DAILY_DATE_PATTERN.test(dailyDate)) {
            throw new Error('Invalid Daily Challenge status request.');
        }
        if (typeof repository.getDailyAttempts !== 'function') {
            throw new Error('Daily Challenge persistence is unavailable.');
        }

        const attempts = await repository.getDailyAttempts(normalizedUserId, dailyDate);
        return {
            dailyDate,
            claimedDifficulties: [...new Set(
                attempts
                    .map(attempt => attempt?.difficulty)
                    .filter(difficulty => DAILY_DIFFICULTIES.includes(difficulty))
            )]
        };
    }

    return {
        getAccountStats,
        getAccountDashboard,
        getDailyChallengeStatus,
        claimDailyChallenge,
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
    DAILY_DIFFICULTIES,
    DEFAULT_ACCOUNT_HISTORY_LIMIT,
    MAX_ACCOUNT_HISTORY_LIMIT,
    XP_LEVEL_SCALE,
    XP_REWARDS,
    ACCOUNT_ACHIEVEMENT_DEFINITIONS,
    buildAccountAchievements,
    buildAccountProgress,
    buildAccountStats,
    buildRecentGames,
    calculateXpReward,
    createAccountStatsService,
    createEmptyModeStats,
    createGameResultKey,
    normalizeResultInput,
    normalizeDailyAttemptInput,
    normalizeHistoryLimit,
    recordAccountGameResultSafely
};
