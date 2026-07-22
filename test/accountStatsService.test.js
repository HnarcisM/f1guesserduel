const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildAccountAchievements,
    buildAccountProgress,
    buildAccountStats,
    calculateXpReward,
    createAccountStatsService,
    normalizeResultInput,
    recordAccountGameResultSafely
} = require('../server/account/accountStatsService');

function createMemoryStatsRepository() {
    const rows = new Map();
    const resultKeys = new Set();
    const recentResults = [];
    const progressByUser = new Map();
    const dailyAttempts = new Map();

    function getRow(userId, mode) {
        const key = `${userId}:${mode}`;
        if (!rows.has(key)) {
            rows.set(key, {
                mode,
                games_played: 0,
                games_won: 0,
                games_drawn: 0,
                current_streak: 0,
                best_streak: 0,
                guess_1: 0,
                guess_2: 0,
                guess_3: 0,
                guess_4: 0,
                guess_5: 0,
                guess_6: 0
            });
        }
        return rows.get(key);
    }

    async function getStatsRows(userId) {
        return [...rows.entries()]
            .filter(([key]) => key.startsWith(`${userId}:`))
            .map(([, row]) => ({ ...row }));
    }

    async function getRecentResults(userId, limit = 10) {
        return recentResults
            .filter(result => result.userId === userId)
            .slice(-limit)
            .reverse()
            .map(result => ({ ...result }));
    }

    async function getProgressRow(userId) {
        return { total_xp: progressByUser.get(userId) || 0 };
    }

    async function getDailyAttempts(userId, dailyDate) {
        return [...dailyAttempts.values()].filter(attempt => (
            attempt.userId === userId && attempt.dailyDate === dailyDate
        ));
    }

    async function claimDailyAttempt(attempt) {
        const key = `${attempt.userId}:${attempt.challengeId}`;
        if (dailyAttempts.has(key)) return false;
        dailyAttempts.set(key, { ...attempt });
        return true;
    }

    return {
        getStatsRows,
        getRecentResults,
        getProgressRow,
        getDailyAttempts,
        claimDailyAttempt,
        async recordGameResult(result) {
            const uniqueKey = `${result.userId}:${result.mode}:${result.resultKey}`;
            if (resultKeys.has(uniqueKey)) {
                return {
                    recorded: false,
                    rows: await getStatsRows(result.userId),
                    recentResults: await getRecentResults(result.userId),
                    progressRow: await getProgressRow(result.userId)
                };
            }
            resultKeys.add(uniqueKey);
            progressByUser.set(result.userId, (progressByUser.get(result.userId) || 0) + result.xpEarned);
            recentResults.push({
                ...result,
                completedAt: `2026-07-${String(recentResults.length + 18).padStart(2, '0')}T12:00:00.000Z`
            });

            const row = getRow(result.userId, result.mode);
            row.games_played += 1;
            if (result.outcome === 'win') {
                row.games_won += 1;
                row.current_streak += 1;
                row.best_streak = Math.max(row.best_streak, row.current_streak);
                row[`guess_${result.attempts}`] += 1;
            } else {
                row.current_streak = 0;
                if (result.outcome === 'draw') row.games_drawn += 1;
            }
            return {
                recorded: true,
                rows: await getStatsRows(result.userId),
                recentResults: await getRecentResults(result.userId),
                progressRow: await getProgressRow(result.userId)
            };
        }
    };
}

test('account stats aggregate modes and ignore duplicate server result keys', async () => {
    const service = createAccountStatsService(createMemoryStatsRepository());

    const first = await service.recordGameResult({
        userId: 7,
        mode: 'single',
        resultKey: 'single:round-1',
        outcome: 'win',
        attempts: 2,
        difficulty: 'easy'
    });
    const duplicate = await service.recordGameResult({
        userId: 7,
        mode: 'single',
        resultKey: 'single:round-1',
        outcome: 'win',
        attempts: 2,
        difficulty: 'easy'
    });
    await service.recordGameResult({
        userId: 7,
        mode: 'daily',
        resultKey: 'daily:2026-07-18:easy',
        outcome: 'loss',
        attempts: 6,
        difficulty: 'easy'
    });
    const stats = await service.getAccountStats(7);
    const dashboard = await service.getAccountDashboard(7);

    assert.equal(first.recorded, true);
    assert.equal(first.xpAwarded, 50);
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.xpAwarded, 0);
    assert.deepEqual(stats.totals, {
        played: 2,
        won: 1,
        drawn: 0,
        lost: 1,
        winRate: 50,
        bestStreak: 1
    });
    assert.equal(stats.modes.single.distribution[2], 1);
    assert.equal(stats.modes.single.played, 1);
    assert.equal(stats.modes.daily.played, 1);
    assert.equal(stats.modes.duel.played, 0);
    assert.equal(dashboard.recentGames.length, 2);
    assert.equal(dashboard.progress.totalXp, 70);
    assert.equal(dashboard.progress.level, 1);
    assert.equal(dashboard.progress.progressPercent, 70);
    assert.equal(dashboard.achievements.length, 8);
    assert.deepEqual(
        dashboard.achievements.filter(achievement => achievement.unlocked).map(achievement => achievement.key),
        ['first-lap', 'first-win']
    );
    assert.deepEqual(dashboard.recentGames[0], {
        mode: 'daily',
        outcome: 'loss',
        attempts: 6,
        difficulty: 'easy',
        completedAt: '2026-07-19T12:00:00.000Z'
    });
    assert.equal(Object.hasOwn(dashboard.recentGames[0], 'resultKey'), false);
    assert.equal(Object.hasOwn(dashboard.recentGames[0], 'userId'), false);
});

test('Daily attempts are claimed atomically and exposed per account and UTC date', async () => {
    const service = createAccountStatsService(createMemoryStatsRepository());
    const easyAttempt = {
        userId: 7,
        challengeId: 'f1-daily-v1:2026-07-23:easy',
        dailyDate: '2026-07-23',
        difficulty: 'easy'
    };

    assert.equal(await service.claimDailyChallenge(easyAttempt), true);
    assert.equal(await service.claimDailyChallenge(easyAttempt), false);
    assert.equal(await service.claimDailyChallenge({
        ...easyAttempt,
        challengeId: 'f1-daily-v1:2026-07-23:hard',
        difficulty: 'hard'
    }), true);

    assert.deepEqual(await service.getDailyChallengeStatus(7, '2026-07-23'), {
        dailyDate: '2026-07-23',
        claimedDifficulties: ['easy', 'hard']
    });
    assert.deepEqual(await service.getDailyChallengeStatus(8, '2026-07-23'), {
        dailyDate: '2026-07-23',
        claimedDifficulties: []
    });
});

test('XP rewards and nonlinear level progress are deterministic', () => {
    assert.equal(calculateXpReward({ mode: 'single', outcome: 'win', difficulty: 'easy' }), 50);
    assert.equal(calculateXpReward({ mode: 'daily', outcome: 'win', difficulty: 'hard' }), 70);
    assert.equal(calculateXpReward({ mode: 'duel', outcome: 'draw', difficulty: 'medium' }), 40);
    assert.equal(calculateXpReward({ mode: 'single', outcome: 'loss', difficulty: 'easy' }), 10);

    assert.deepEqual(buildAccountProgress({ total_xp: 250 }), {
        level: 2,
        totalXp: 250,
        levelStartXp: 100,
        nextLevelXp: 400,
        xpIntoLevel: 150,
        xpForLevel: 300,
        xpToNextLevel: 150,
        progressPercent: 50
    });
});

test('achievements expose bounded progress derived from authoritative account totals', () => {
    const stats = buildAccountStats([{
        mode: 'single',
        games_played: 5,
        games_won: 3,
        games_drawn: 0,
        current_streak: 3,
        best_streak: 3,
        guess_1: 1,
        guess_2: 2,
        guess_3: 0,
        guess_4: 0,
        guess_5: 0,
        guess_6: 0
    }]);
    const achievements = buildAccountAchievements(stats, buildAccountProgress({ total_xp: 500 }));

    assert.equal(achievements.length, 8);
    assert.equal(achievements.find(item => item.key === 'pole-position').unlocked, true);
    assert.equal(achievements.find(item => item.key === 'hat-trick').progressPercent, 100);
    assert.equal(achievements.find(item => item.key === 'daily-regular').progressPercent, 0);
    assert.equal(achievements.find(item => item.key === 'xp-500').unlocked, true);
});

test('account stats validation rejects client-like invalid result data', () => {
    assert.throws(
        () => normalizeResultInput({ userId: 7, mode: 'invalid', resultKey: 'x', outcome: 'win', attempts: 1 }),
        /Invalid account game result/
    );
    assert.throws(
        () => normalizeResultInput({ userId: 7, mode: 'single', resultKey: 'x', outcome: 'win', attempts: 99 }),
        /Invalid account game attempts/
    );
    assert.equal(buildAccountStats().totals.played, 0);
});

test('safe account stats recording never interrupts gameplay when persistence fails', async () => {
    const logs = [];
    const result = await recordAccountGameResultSafely({
        accountStatsService: {
            async recordGameResult() {
                throw new Error('database unavailable');
            }
        },
        logger: {
            error(message, metadata) {
                logs.push({ message, metadata });
            }
        },
        userId: 7,
        mode: 'single',
        resultKey: 'single:safe-failure',
        outcome: 'loss',
        attempts: 6,
        difficulty: 'hard'
    });

    assert.equal(result, null);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.mode, 'single');
    assert.equal(JSON.stringify(logs).includes('userId'), false);
});
