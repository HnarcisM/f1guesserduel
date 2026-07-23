const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDuelAccountResults } = require('../server/socket/registerSocketHandlers');
const { registerDailyChallengeSocketHandlers } = require('../server/socket/dailyChallengeSocketHandlers');
const { registerSoloGameSocketHandlers } = require('../server/socket/soloGameSocketHandlers');

function createSocket() {
    const handlers = new Map();
    const emitted = [];
    return {
        id: 'socket-7',
        user: { id: 7, username: 'Narcis' },
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        trigger(eventName, payload) {
            return handlers.get(eventName)?.(payload);
        },
        emitted
    };
}

test('Single records an authenticated result only after the server validates the guess', async () => {
    const socket = createSocket();
    const target = {
        id: 'driver-1',
        name: 'Driver One',
        nat: 'British',
        team: ['McLaren'],
        age: 25,
        debut: 2020,
        wins: 1
    };
    const recorded = [];

    registerSoloGameSocketHandlers({
        socket,
        singleSessions: new Map(),
        leaveCurrentRoom() {},
        gameService: {
            startSingleRound() {
                return {
                    drivers: [target],
                    targetDriver: target,
                    difficulty: 'easy',
                    timed: false,
                    timeLimitSeconds: 60,
                    roundStartedAt: Date.now()
                };
            },
            restartSingleRound() { return null; }
        },
        accountStatsService: {
            async recordGameResult(result) {
                recorded.push(result);
                return {
                    recorded: true,
                    stats: { totals: { played: 1 }, modes: {} },
                    progress: { level: 1, totalXp: 50, progressPercent: 50 },
                    achievements: [{ key: 'first-win', unlocked: true }],
                    xpAwarded: 50,
                    reward: {
                        mode: 'single', outcome: 'win', xpAwarded: 50,
                        previousLevel: 1, level: 1, leveledUp: false,
                        unlockedAchievements: [{ key: 'first-win', title: 'Prima victorie', icon: '🏆' }]
                    }
                };
            }
        }
    });

    await socket.trigger('startSingleGame', { level: 'easy' });
    await socket.trigger('submitSingleGuess', 'unknown-driver');
    assert.equal(recorded.length, 0);

    await socket.trigger('submitSingleGuess', target.id);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].userId, 7);
    assert.equal(recorded[0].mode, 'single');
    assert.equal(recorded[0].outcome, 'win');
    assert.equal(recorded[0].attempts, 1);
    const accountUpdate = socket.emitted.find(event => event.eventName === 'accountStatsUpdated');
    assert.equal(accountUpdate.payload.progress.totalXp, 50);
    assert.equal(accountUpdate.payload.achievements[0].key, 'first-win');
    assert.equal(accountUpdate.payload.xpAwarded, 50);
    assert.equal(accountUpdate.payload.reward.unlockedAchievements[0].key, 'first-win');
});

test('Duel account results map authenticated winners, losses and draws without guests', () => {
    const room = {
        roundStartedAt: 12345,
        difficulty: 'hard',
        players: {
            winner: { socketId: 'winner', userId: 7, attempts: 2 },
            loser: { socketId: 'loser', userId: 8, attempts: 4 },
            guest: { socketId: 'guest', userId: null, attempts: 6 }
        }
    };

    const winResults = buildDuelAccountResults('ABC', room, {
        status: 'win',
        winnerSocketId: 'winner'
    });
    const drawResults = buildDuelAccountResults('ABC', room, {
        status: 'draw',
        winnerSocketId: null
    });

    assert.deepEqual(winResults.map(result => result.outcome), ['win', 'loss']);
    assert.deepEqual(drawResults.map(result => result.outcome), ['draw', 'draw']);
    assert.equal(winResults[0].resultKey, 'ABC:12345');
    assert.equal(winResults.some(result => result.userId === null), false);
});

test('Daily uses the server challenge id as the idempotent account result key', async () => {
    const socket = createSocket();
    const target = {
        id: 'daily-driver',
        name: 'Daily Driver',
        nat: 'Romanian',
        team: ['Ferrari'],
        age: 24,
        debut: 2024,
        wins: 1
    };
    const recorded = [];

    registerDailyChallengeSocketHandlers({
        socket,
        dailySessions: new Map(),
        singleSessions: new Map(),
        leaveCurrentRoom() {},
        gameService: {
            startDailyChallenge() {
                return {
                    drivers: [target],
                    targetDriver: target,
                    difficulty: 'medium',
                    dailyDate: '2026-07-18',
                    dailyChallengeId: 'daily:2026-07-18:medium',
                    roundStartedAt: Date.now()
                };
            }
        },
        accountStatsService: {
            async claimDailyChallenge() {
                return true;
            },
            async getDailyChallengeStatus(_userId, dailyDate) {
                return { dailyDate, claimedDifficulties: ['medium'] };
            },
            async recordGameResult(result) {
                recorded.push(result);
                return {
                    recorded: true,
                    stats: { totals: { played: 1 }, modes: {} },
                    progress: { level: 1, totalXp: 65, progressPercent: 65 },
                    achievements: [{ key: 'first-win', unlocked: true }],
                    xpAwarded: 65,
                    reward: {
                        mode: 'daily', outcome: 'win', xpAwarded: 65,
                        previousLevel: 1, level: 1, leveledUp: false,
                        unlockedAchievements: []
                    }
                };
            }
        },
        now: () => new Date('2026-07-18T12:00:00.000Z')
    });

    await socket.trigger('startDailyChallenge', { level: 'medium', dailyDate: '2099-01-01' });
    socket.trigger('submitDailyGuess', target.id);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].mode, 'daily');
    assert.equal(recorded[0].resultKey, 'daily:2026-07-18:medium');
    assert.equal(recorded[0].outcome, 'win');
    const accountUpdate = socket.emitted.find(event => event.eventName === 'accountStatsUpdated');
    assert.equal(accountUpdate.payload.progress.totalXp, 65);
    assert.equal(accountUpdate.payload.achievements[0].unlocked, true);
    assert.equal(accountUpdate.payload.xpAwarded, 65);
    assert.equal(accountUpdate.payload.reward.mode, 'daily');
});
