'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSeededRandom } = require('../server/game/extendedModesService');
const {
    normalizeGuessId,
    normalizeStartPayload,
    normalizeSudokuPayload,
    registerExtendedModesSocketHandlers
} = require('../server/socket/extendedModesSocketHandlers');

function buildDrivers(count = 42) {
    const teams = [
        ['Ferrari', 'McLaren'], ['Williams', 'Mercedes'], ['Red Bull', 'Ferrari'],
        ['Renault', 'McLaren'], ['Ferrari', 'Williams'], ['McLaren', 'Mercedes'],
        ['Williams', 'Renault'], ['Red Bull', 'McLaren'], ['Ferrari', 'Mercedes']
    ];
    const nations = ['GBR', 'GER', 'FRA', 'ITA', 'BRA', 'ESP'];
    return Array.from({ length: count }, (_, index) => ({
        id: `D${index + 1}`,
        name: `Driver ${index + 1}`,
        nat: nations[index % nations.length],
        team: teams[index % teams.length],
        age: 20 + index,
        debut: 1950 + index * 2,
        wins: index % 4 === 0 ? 12 + index : index % 3,
        difficulty: ['easy', 'medium', 'hard'][index % 3]
    }));
}

function createFakeSocket(id = 'socket-1') {
    const handlers = new Map();
    const emitted = [];
    return {
        id,
        handlers,
        emitted,
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        async trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.equal(typeof handler, 'function', `Missing handler for ${eventName}`);
            return handler(payload);
        },
        last(eventName) {
            return [...emitted].reverse().find(entry => entry.eventName === eventName) || null;
        }
    };
}

function createHarness({ authenticated = true } = {}) {
    let now = Date.UTC(2026, 6, 25, 12, 0, 0);
    const timers = [];
    const socket = createFakeSocket();
    socket.user = authenticated ? { id: 7, username: 'Narcis' } : null;
    const sessions = new Map();
    const weeklyAttempts = new Map();
    const weeklyCompletions = [];
    let leaveCalls = 0;
    let clearSoloCalls = 0;
    const accountStatsService = {
        async getWeeklyChallengeStatus(userId, weekKey) {
            const attempt = weeklyAttempts.get(`${userId}:${weekKey}`) || null;
            return {
                weekKey,
                claimed: Boolean(attempt),
                challengeId: attempt?.challengeId || null,
                difficulty: attempt?.difficulty || null,
                result: attempt?.result || null
            };
        },
        async claimWeeklyChallenge(attempt) {
            const key = `${attempt.userId}:${attempt.weekKey}`;
            if (weeklyAttempts.has(key)) return false;
            weeklyAttempts.set(key, { ...attempt, result: null });
            return true;
        },
        async completeWeeklyChallenge(result) {
            const key = `${result.userId}:${result.weekKey}`;
            const attempt = weeklyAttempts.get(key);
            if (!attempt || attempt.challengeId !== result.challengeId || attempt.result) return false;
            attempt.result = { ...result };
            weeklyCompletions.push({ ...result });
            return true;
        }
    };

    const controller = registerExtendedModesSocketHandlers({
        socket,
        extendedSessions: sessions,
        gameService: { getAllDrivers: () => buildDrivers() },
        leaveCurrentRoom: async () => { leaveCalls += 1; },
        clearSoloModeSessions: () => { clearSoloCalls += 1; },
        accountStatsService,
        now: () => new Date(now),
        onSocketEvent: (eventName, handler) => socket.on(eventName, handler),
        clock: () => now,
        setTimeoutFn: (handler, delay) => {
            const timer = { handler, delay, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimeoutFn: timer => { timer.cleared = true; },
        logger: { error() {} }
    });

    return {
        socket,
        sessions,
        controller,
        timers,
        weeklyAttempts,
        weeklyCompletions,
        get leaveCalls() { return leaveCalls; },
        get clearSoloCalls() { return clearSoloCalls; },
        advance(ms) { now += ms; }
    };
}

test('socket payload normalizers accept compact and object forms', () => {
    assert.deepEqual(normalizeStartPayload('speed-run'), { variantKey: 'speed-run', options: {} });
    assert.deepEqual(normalizeStartPayload({
        variantKey: ' ERA ',
        options: { eraKey: 'Modern', difficulty: 'HARD', seed: ' abc ' }
    }), {
        variantKey: 'era',
        options: { difficulty: 'hard', eraKey: 'modern', seed: 'abc' }
    });
    assert.equal(normalizeStartPayload(null), null);
    assert.equal(normalizeGuessId({ entityId: ' ferrari ' }), 'ferrari');
    assert.deepEqual(normalizeSudokuPayload({ cellIndex: 3, driverId: 'HAM' }), { cellIndex: 3, driverId: 'HAM' });
    assert.equal(normalizeSudokuPayload({ cellIndex: 'bad', driverId: 'HAM' }), null);
});

test('starting an extended mode leaves Duel, clears solo sessions and emits a hidden-target payload', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'speed-run',
        options: { difficulty: 'all' }
    });

    assert.equal(harness.leaveCalls, 1);
    assert.equal(harness.clearSoloCalls, 1);
    assert.equal(harness.sessions.size, 1);
    const started = harness.socket.last('extendedModeStarted');
    assert.ok(started);
    assert.equal(started.payload.variantKey, 'speed-run');
    assert.equal(started.payload.state.round.roundNumber, 1);
    assert.equal(Object.hasOwn(started.payload.state.round, 'target'), false);
    assert.equal(harness.timers.length, 1);
    assert.equal(harness.timers[0].delay, 90_000);
});

test('correct Speed Run guess emits feedback and keeps the session waiting for continue', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', 'speed-run');
    const session = harness.controller.getSession();
    const target = session.targets[0];

    harness.advance(100);
    await harness.socket.trigger('submitExtendedGuess', { id: target.id });
    const feedback = harness.socket.last('extendedGuessResult');
    assert.ok(feedback);
    assert.equal(feedback.payload.isCorrect, true);
    assert.equal(feedback.payload.roundComplete, true);
    assert.equal(feedback.payload.feedback.guess.id, target.id);
    assert.equal(session.awaitingAdvance, true);
    assert.equal(harness.socket.last('extendedModeFinished'), null);

    harness.advance(100);
    await harness.socket.trigger('continueExtendedMode');
    const next = harness.socket.last('extendedRoundReady');
    assert.ok(next);
    assert.equal(next.payload.state.round.roundNumber, 2);
});

test('single-round modes emit final payload after a correct guess', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', 'constructor');
    const session = harness.controller.getSession();
    const target = session.targets[0];

    harness.advance(100);
    await harness.socket.trigger('submitExtendedGuess', target.id);
    const finished = harness.socket.last('extendedModeFinished');
    assert.ok(finished);
    assert.equal(finished.payload.reason, 'completed');
    assert.equal(finished.payload.target.id, target.id);
});

test('Pilot Sudoku uses a dedicated event and never exposes the generated solution', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'pilot-sudoku',
        options: { seed: 'socket-sudoku' }
    });
    const started = harness.socket.last('extendedModeStarted').payload;
    assert.equal(Object.hasOwn(started.state.sudoku, 'solution'), false);

    const session = harness.controller.getSession();
    const answer = session.sudoku.solution[0];
    harness.advance(100);
    await harness.socket.trigger('submitExtendedSudokuGuess', {
        cellIndex: 0,
        driverId: answer.id
    });
    const update = harness.socket.last('extendedSudokuUpdate');
    assert.ok(update);
    assert.equal(update.payload.correct, true);
    assert.equal(update.payload.driver.id, answer.id);
});

test('Weekly requires an account and exposes authoritative availability status', async () => {
    const harness = createHarness({ authenticated: false });
    await harness.socket.trigger('requestWeeklyChallengeStatus');
    assert.deepEqual(harness.socket.last('weeklyChallengeStatus').payload, {
        authenticated: false,
        weekKey: '2026-W30',
        nextResetAt: '2026-07-27T00:00:00.000Z',
        claimed: false,
        difficulty: null,
        challengeId: null,
        result: null
    });

    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'weekly',
        options: { difficulty: 'easy' }
    });
    assert.equal(harness.sessions.size, 0);
    assert.match(harness.socket.last('extendedModeError').payload, /Autentifică-te/i);
});

test('Weekly claims one difficulty for the whole ISO week and persists the final score', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'weekly',
        options: { difficulty: 'easy' }
    });
    const session = harness.controller.getSession();
    assert.ok(session.catalog.every(driver => driver.difficulty === 'easy'));
    assert.equal(session.weekKey, '2026-W30');
    assert.match(session.challengeId, /^f1-weekly-v2:2026-W30:easy$/);
    assert.equal(harness.weeklyAttempts.size, 1);

    const timer = harness.timers[0];
    harness.advance(timer.delay);
    await timer.handler();
    const finished = harness.socket.last('extendedModeFinished');
    assert.ok(finished);
    assert.equal(finished.payload.reason, 'time-expired');
    assert.equal(harness.weeklyCompletions.length, 1);
    assert.equal(harness.weeklyCompletions[0].challengeId, session.challengeId);

    await harness.socket.trigger('leaveExtendedMode');
    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'weekly',
        options: { difficulty: 'hard' }
    });
    assert.equal(harness.sessions.size, 0);
    assert.match(harness.socket.last('extendedModeError').payload, /deja încercarea Weekly/i);
});

test('restart reuses the original variant and options', async () => {
    const harness = createHarness();
    await harness.socket.trigger('startExtendedMode', {
        variantKey: 'era',
        options: { eraKey: 'modern' }
    });
    const first = harness.controller.getSession();
    assert.equal(first.era.key, 'modern');

    harness.advance(100);
    await harness.socket.trigger('restartExtendedMode');
    const second = harness.controller.getSession();
    assert.notEqual(second.id, first.id);
    assert.equal(second.era.key, 'modern');
});

test('extended mode start requests are bounded per socket window', async () => {
    const harness = createHarness();
    for (let index = 0; index < 20; index++) {
        await harness.socket.trigger('startExtendedMode', 'constructor');
    }
    assert.equal(harness.socket.emitted.filter(entry => entry.eventName === 'extendedModeStarted').length, 20);

    await harness.socket.trigger('startExtendedMode', 'constructor');
    const error = harness.socket.last('extendedModeError');
    assert.ok(error);
    assert.match(error.payload, /prea multe sesiuni/i);
});
