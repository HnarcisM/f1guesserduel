'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    EXTENDED_VARIANTS,
    SPEED_RUN_ROUNDS,
    SPEED_RUN_SECONDS,
    createExtendedModesService,
    createSeededRandom,
    filterDriversByEra,
    getIsoWeekInfo,
    matchesSudokuCriterion
} = require('../server/game/extendedModesService');

const TEAM_SETS = [
    ['Ferrari', 'McLaren', 'Williams'],
    ['Mercedes', 'Williams'],
    ['Red Bull', 'Ferrari'],
    ['Renault', 'McLaren'],
    ['Ferrari', 'Williams'],
    ['McLaren', 'Mercedes'],
    ['Williams', 'Renault'],
    ['Red Bull', 'McLaren'],
    ['Ferrari', 'Mercedes'],
    ['McLaren', 'Williams'],
    ['Williams', 'Red Bull'],
    ['Renault', 'Ferrari']
];
const NATIONS = ['GBR', 'GER', 'FRA', 'ITA', 'BRA', 'ESP'];

function buildDrivers(count = 42) {
    return Array.from({ length: count }, (_, index) => ({
        id: `D${String(index + 1).padStart(2, '0')}`,
        name: `Driver ${index + 1}`,
        nat: NATIONS[index % NATIONS.length],
        team: TEAM_SETS[index % TEAM_SETS.length],
        age: 22 + (index % 28),
        debut: 1955 + (index * 2),
        wins: index % 5 === 0 ? 20 + index : index % 3,
        difficulty: ['easy', 'medium', 'hard'][index % 3]
    }));
}

function createClock(start = Date.UTC(2026, 6, 25, 12, 0, 0)) {
    let value = start;
    return {
        now: () => value,
        advance(ms) { value += ms; }
    };
}

function createService(options = {}) {
    const clock = options.clock || createClock();
    return {
        clock,
        service: createExtendedModesService({
            drivers: buildDrivers(),
            clock: clock.now,
            random: createSeededRandom(options.seed || 'tests')
        })
    };
}

test('Speed Run creates five unique server-side targets and a 90 second deadline', () => {
    const { service, clock } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.SPEED_RUN, { difficulty: 'all' });

    assert.equal(session.variantKey, 'speed-run');
    assert.equal(session.targets.length, SPEED_RUN_ROUNDS);
    assert.equal(new Set(session.targets.map(target => target.id)).size, SPEED_RUN_ROUNDS);
    assert.equal(session.expiresAt - session.startedAt, SPEED_RUN_SECONDS * 1000);

    const payload = service.buildStartedPayload(session);
    assert.equal(payload.catalog.length, buildDrivers().length);
    assert.equal(payload.state.round.roundNumber, 1);
    assert.equal(payload.state.round.remainingSeconds, 90);
    assert.equal(Object.hasOwn(payload.state.round, 'target'), false);

    clock.advance(1_500);
    assert.equal(service.buildSessionState(session).round.remainingSeconds, 89);
});

test('Speed Run scores a correct guess, reveals the round and advances without repeating targets', () => {
    const { service } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.SPEED_RUN);
    const firstTarget = session.targets[0];

    const result = service.submitGuess(session, firstTarget.id);
    assert.equal(result.finished, false);
    assert.equal(result.roundComplete, true);
    assert.equal(result.payload.isCorrect, true);
    assert.equal(result.payload.target.id, firstTarget.id);
    assert.ok(result.payload.points > 1000);
    assert.equal(session.awaitingAdvance, true);

    const next = service.continueSession(session);
    assert.equal(next.finished, false);
    assert.equal(session.roundIndex, 1);
    assert.equal(session.attempts, 0);
    assert.notEqual(session.targets[1].id, firstTarget.id);
});

test('Speed Run skip applies penalty and keeps the next round server-authoritative', () => {
    const { service } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.SPEED_RUN);
    session.score = 400;

    const result = service.skipRound(session);
    assert.equal(result.finished, false);
    assert.equal(result.payload.skipped, true);
    assert.equal(session.score, 150);
    assert.equal(session.awaitingAdvance, true);
});

test('Era Challenge filters targets by debut range', () => {
    const drivers = buildDrivers();
    const modern = filterDriversByEra(drivers, 'modern');
    assert.ok(modern.length > 0);
    assert.ok(modern.every(driver => driver.debut >= 1990 && driver.debut <= 2009));

    const { service } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.ERA, { eraKey: 'modern' });
    assert.equal(session.era.key, 'modern');
    assert.ok(session.targets[0].debut >= 1990 && session.targets[0].debut <= 2009);
});

test('Streak grants a new target after success and ends after three failed attempts', () => {
    const { service } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.STREAK);
    const firstTarget = session.currentTarget;

    const win = service.submitGuess(session, firstTarget.id);
    assert.equal(win.roundComplete, true);
    assert.equal(session.streak, 1);
    service.continueSession(session);
    assert.notEqual(session.currentTarget.id, firstTarget.id);

    const wrong = session.catalog.find(driver => driver.id !== session.currentTarget.id);
    service.submitGuess(session, wrong.id);
    service.submitGuess(session, wrong.id);
    const loss = service.submitGuess(session, wrong.id);
    assert.equal(loss.finished, true);
    assert.equal(loss.payload.reason, 'streak-ended');
    assert.equal(loss.payload.streak, 1);
});

test('Weekly Challenge is deterministic for the same ISO week', () => {
    const date = new Date('2026-07-25T12:00:00Z');
    const firstClock = createClock(date.getTime());
    const secondClock = createClock(date.getTime());
    const first = createExtendedModesService({ drivers: buildDrivers(), clock: firstClock.now, random: Math.random });
    const second = createExtendedModesService({ drivers: buildDrivers(), clock: secondClock.now, random: Math.random });

    const firstSession = first.startSession(EXTENDED_VARIANTS.WEEKLY, { date });
    const secondSession = second.startSession(EXTENDED_VARIANTS.WEEKLY, { date });

    assert.equal(firstSession.challengeId, secondSession.challengeId);
    assert.deepEqual(firstSession.targets.map(target => target.id), secondSession.targets.map(target => target.id));
    assert.equal(firstSession.era.key, secondSession.era.key);
    assert.match(firstSession.challengeId, /^weekly-2026-W\d{2}$/);
    assert.equal(getIsoWeekInfo(date).key, firstSession.challengeId.replace('weekly-', ''));
});

test('Constructor and Track modes expose catalogs but hide target identity until completion', () => {
    const { service } = createService();
    for (const variant of [EXTENDED_VARIANTS.CONSTRUCTOR, EXTENDED_VARIANTS.TRACK]) {
        const session = service.startSession(variant);
        const started = service.buildStartedPayload(session);
        assert.ok(started.catalog.length >= 10);
        assert.equal(started.state.phase, 'playing');
        assert.equal(Object.hasOwn(started.state.round, 'target'), false);

        const target = session.targets[0];
        const result = service.submitGuess(session, target.id);
        assert.equal(result.finished, true);
        assert.equal(result.payload.reason, 'completed');
        assert.equal(result.payload.target.id, target.id);
    }
});

test('Track mode publishes only the silhouette as the initial clue', () => {
    const { service } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.TRACK);
    const state = service.buildSessionState(session);

    assert.equal(state.round.clue.type, 'track-layout');
    assert.ok(Array.isArray(state.round.clue.layout));
    assert.ok(state.round.clue.layout.length > 10);
    assert.equal(Object.hasOwn(state.round.clue, 'name'), false);
});

test('Pilot Sudoku generates a solvable 3x3 puzzle with unique valid drivers', () => {
    const { service } = createService({ seed: 'sudoku' });
    const session = service.startSession(EXTENDED_VARIANTS.PILOT_SUDOKU, { seed: 'weekly-puzzle' });

    assert.equal(session.sudoku.solution.length, 9);
    assert.equal(new Set(session.sudoku.solution.map(driver => driver.id)).size, 9);
    session.sudoku.solution.forEach((driver, cellIndex) => {
        const row = session.sudoku.rows[Math.floor(cellIndex / 3)];
        const column = session.sudoku.columns[cellIndex % 3];
        assert.equal(matchesSudokuCriterion(driver, row), true);
        assert.equal(matchesSudokuCriterion(driver, column), true);
    });

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
        const answer = session.sudoku.solution[cellIndex];
        const result = service.submitSudokuGuess(session, cellIndex, answer.id);
        if (cellIndex < 8) {
            assert.equal(result.finished, false);
            assert.equal(result.correct, true);
        } else {
            assert.equal(result.finished, true);
            assert.equal(result.payload.reason, 'completed');
            assert.equal(result.payload.sudoku.activeCount, 9);
        }
    }
});

test('Pilot Sudoku rejects duplicates and invalid intersections without exposing solutions', () => {
    const { service } = createService({ seed: 'sudoku-invalid' });
    const session = service.startSession(EXTENDED_VARIANTS.PILOT_SUDOKU, { seed: 'invalid-case' });
    const started = service.buildStartedPayload(session);

    assert.equal(Object.hasOwn(started.state.sudoku, 'solution'), false);
    const first = session.sudoku.solution[0];
    assert.equal(service.submitSudokuGuess(session, 0, first.id).correct, true);
    const duplicate = service.submitSudokuGuess(session, 1, first.id);
    assert.match(duplicate.error, /două ori/i);

    const invalid = session.catalog.find(driver => (
        !matchesSudokuCriterion(driver, session.sudoku.rows[0])
        || !matchesSudokuCriterion(driver, session.sudoku.columns[1])
    ));
    const invalidResult = service.submitSudokuGuess(session, 1, invalid.id);
    assert.equal(invalidResult.correct, false);
    assert.equal(session.sudoku.mistakes, 1);
});

test('Timed modes finish only after the server clock reaches the deadline', () => {
    const { service, clock } = createService();
    const session = service.startSession(EXTENDED_VARIANTS.SPEED_RUN);

    clock.advance((SPEED_RUN_SECONDS * 1000) - 1);
    assert.equal(service.expireSession(session), null);
    clock.advance(1);
    const finished = service.expireSession(session);
    assert.equal(finished.reason, 'time-expired');
    assert.equal(session.phase, 'finished');
});
