const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildAccountStats,
    createAccountStatsService,
    normalizeResultInput,
    recordAccountGameResultSafely
} = require('../server/account/accountStatsService');

function createMemoryStatsRepository() {
    const rows = new Map();
    const resultKeys = new Set();
    const recentResults = [];

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

    return {
        getStatsRows,
        getRecentResults,
        async recordGameResult(result) {
            const uniqueKey = `${result.userId}:${result.mode}:${result.resultKey}`;
            if (resultKeys.has(uniqueKey)) {
                return {
                    recorded: false,
                    rows: await getStatsRows(result.userId),
                    recentResults: await getRecentResults(result.userId)
                };
            }
            resultKeys.add(uniqueKey);
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
                recentResults: await getRecentResults(result.userId)
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
    assert.equal(duplicate.recorded, false);
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
