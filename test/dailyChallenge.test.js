const test = require('node:test');
const assert = require('node:assert/strict');

const { pickDailyDriver, getDailyDateKey } = require('../server/game/dailyChallenge');
const { createGameService } = require('../server/game/gameService');

const drivers = [
    { id: 'a', name: 'Driver A', difficulty: 'easy' },
    { id: 'b', name: 'Driver B', difficulty: 'easy' },
    { id: 'c', name: 'Driver C', difficulty: 'easy' }
];

test('getDailyDateKey accepts explicit browser local date key', () => {
    assert.equal(getDailyDateKey('2026-07-01'), '2026-07-01');
});

test('pickDailyDriver returns same driver for same date and difficulty', () => {
    const first = pickDailyDriver(drivers, 'easy', new Date('2026-06-30T10:00:00.000Z'));
    const second = pickDailyDriver(drivers, 'easy', new Date('2026-06-30T22:00:00.000Z'));

    assert.equal(first.driver.id, second.driver.id);
    assert.equal(first.dateKey, '2026-06-30');
});

test('gameService daily challenge is deterministic and independent from duel rooms', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);

    const dailyA = gameService.startDailyChallenge('easy', '2026-06-30');
    const dailyB = gameService.startDailyChallenge('easy', '2026-06-30');

    assert.equal(dailyA.isDailyChallenge, true);
    assert.equal(dailyA.dailyDate, '2026-06-30');
    assert.equal(dailyA.targetDriver.id, dailyB.targetDriver.id);
    assert.equal(dailyA.dailyChallengeId, 'f1-daily-v1:2026-06-30:easy');
});

test('duel rounds ignore daily flags and remain normal multiplayer rounds', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);
    const room = { players: {}, difficulty: null };

    const payload = gameService.startNewRound(room, {
        difficulty: 'easy',
        daily: true,
        dailyDate: new Date('2026-06-30T09:00:00.000Z')
    });

    assert.equal(payload.isDailyChallenge, false);
    assert.equal(payload.dailyDate, null);
    assert.equal(room.isDailyChallenge, false);
    assert.equal(room.dailyChallengeId, null);
});

test('single rounds are independent from duel rooms', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);
    const room = { players: {}, difficulty: null };

    const singlePayload = gameService.startSingleRound({ difficulty: 'easy', timed: true, timeLimitSeconds: 60 });

    assert.equal(singlePayload.isSinglePlay, true);
    assert.equal(singlePayload.difficulty, 'easy');
    assert.equal(singlePayload.timed, true);
    assert.equal(singlePayload.timeLimitSeconds, 60);
    assert.equal(room.difficulty, null);
});

test('single restart keeps previous difficulty without requiring a room', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);
    const firstRound = gameService.startSingleRound({ difficulty: 'easy' });

    const restarted = gameService.restartSingleRound(firstRound, { timed: false });

    assert.equal(restarted.isSinglePlay, true);
    assert.equal(restarted.difficulty, 'easy');
    assert.equal(Array.isArray(restarted.drivers), true);
    assert.ok(restarted.targetDriver);
});


test('daily challenge rejects invalid difficulty without creating a payload', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);

    assert.equal(gameService.startDailyChallenge('legendary', '2026-06-30'), null);
});

test('single play rejects invalid difficulty without requiring a duel room', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);

    assert.equal(gameService.startSingleRound({ difficulty: 'legendary' }), null);
});

test('single play normalizes timer options independently from daily challenge', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);

    const singlePayload = gameService.startSingleRound({ difficulty: 'easy', timed: true, timeLimitSeconds: 120 });
    const dailyPayload = gameService.startDailyChallenge('easy', '2026-07-01');

    assert.equal(singlePayload.isSinglePlay, true);
    assert.equal(singlePayload.timed, true);
    assert.equal(singlePayload.timeLimitSeconds, 120);
    assert.equal(dailyPayload.isDailyChallenge, true);
    assert.equal(dailyPayload.timed, false);
    assert.equal(dailyPayload.timeLimitSeconds, null);
});

test('single restart returns null when no previous single session exists', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);

    assert.equal(gameService.restartSingleRound(null), null);
    assert.equal(gameService.restartSingleRound({}), null);
});

test('single, daily and duel round payloads keep mode-specific flags separated', () => {
    const repository = {
        getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
    };
    const gameService = createGameService(repository);
    const room = { players: {}, difficulty: null };

    const singlePayload = gameService.startSingleRound({ difficulty: 'easy' });
    const dailyPayload = gameService.startDailyChallenge('easy', '2026-07-01');
    const duelPayload = gameService.startNewRound(room, { difficulty: 'easy' });

    assert.equal(singlePayload.isSinglePlay, true);
    assert.equal(singlePayload.isDailyChallenge, undefined);
    assert.equal(dailyPayload.isDailyChallenge, true);
    assert.equal(dailyPayload.isSinglePlay, undefined);
    assert.equal(duelPayload.isDailyChallenge, false);
    assert.equal(duelPayload.isSinglePlay, undefined);
    assert.equal(room.isDailyChallenge, false);
});

test('test-only forced duel target keeps E2E rounds deterministic without affecting single play', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousForcedTarget = process.env.E2E_FIXED_DUEL_TARGET_ID;
    process.env.NODE_ENV = 'test';
    process.env.E2E_FIXED_DUEL_TARGET_ID = 'b';

    try {
        const repository = {
            getDriversByDifficulty: difficulty => difficulty === 'easy' ? drivers : []
        };
        const gameService = createGameService(repository);
        const room = { players: {}, difficulty: null };

        const duelPayload = gameService.startNewRound(room, { difficulty: 'easy' });
        const singlePayload = gameService.startSingleRound({ difficulty: 'easy' });

        assert.equal(room.targetDriver.id, 'b');
        assert.equal(duelPayload.isDailyChallenge, false);
        assert.ok(singlePayload.targetDriver);
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;

        if (previousForcedTarget === undefined) delete process.env.E2E_FIXED_DUEL_TARGET_ID;
        else process.env.E2E_FIXED_DUEL_TARGET_ID = previousForcedTarget;
    }
});
