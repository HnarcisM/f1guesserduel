'use strict';

const { compareGuess } = require('./compareDriver');
const { CONSTRUCTORS, TRACKS } = require('./extendedModesCatalogs');
const {
    getIsoWeekInfo,
    getWeeklyChallengeId,
    normalizeWeeklyDifficulty
} = require('./weeklyChallenge');

const EXTENDED_VARIANTS = Object.freeze({
    SPEED_RUN: 'speed-run',
    ERA: 'era',
    STREAK: 'streak',
    WEEKLY: 'weekly',
    CONSTRUCTOR: 'constructor',
    PILOT_SUDOKU: 'pilot-sudoku',
    TRACK: 'track'
});

const EXTENDED_VARIANT_KEYS = Object.freeze(Object.values(EXTENDED_VARIANTS));
const MAX_DRIVER_ATTEMPTS = 6;
const STREAK_ATTEMPTS = 3;
const SPEED_RUN_ROUNDS = 5;
const SPEED_RUN_SECONDS = 90;
const WEEKLY_ROUNDS = 5;
const WEEKLY_SECONDS = 120;
const SKIP_PENALTY = 250;

const ERA_FILTERS = Object.freeze([
    Object.freeze({ key: 'pioneers', title: 'Pioneers', description: 'Debut înainte de 1970', from: 0, to: 1969 }),
    Object.freeze({ key: 'classic', title: 'Classic', description: 'Debut între 1970 și 1989', from: 1970, to: 1989 }),
    Object.freeze({ key: 'modern', title: 'Modern', description: 'Debut între 1990 și 2009', from: 1990, to: 2009 }),
    Object.freeze({ key: 'hybrid', title: 'Hybrid', description: 'Debut între 2010 și 2019', from: 2010, to: 2019 }),
    Object.freeze({ key: 'current', title: 'Current', description: 'Debut din 2020', from: 2020, to: Number.POSITIVE_INFINITY })
]);

const SUDOKU_ROW_CRITERIA = Object.freeze([
    { id: 'team-ferrari', label: 'A concurat pentru Ferrari', type: 'team', value: 'Ferrari' },
    { id: 'team-mclaren', label: 'A concurat pentru McLaren', type: 'team', value: 'McLaren' },
    { id: 'team-williams', label: 'A concurat pentru Williams', type: 'team', value: 'Williams' },
    { id: 'team-mercedes', label: 'A concurat pentru Mercedes', type: 'team', value: 'Mercedes' },
    { id: 'team-red-bull', label: 'A concurat pentru Red Bull', type: 'team', value: 'Red Bull' },
    { id: 'team-renault', label: 'A concurat pentru Renault', type: 'team', value: 'Renault' }
]);

const SUDOKU_COLUMN_CRITERIA = Object.freeze([
    { id: 'nat-gbr', label: 'Naționalitate GBR', type: 'nat', value: 'GBR' },
    { id: 'nat-ger', label: 'Naționalitate GER', type: 'nat', value: 'GER' },
    { id: 'nat-fra', label: 'Naționalitate FRA', type: 'nat', value: 'FRA' },
    { id: 'wins-10', label: 'Cel puțin 10 victorii', type: 'wins-min', value: 10 },
    { id: 'wins-1', label: 'Cel puțin o victorie', type: 'wins-min', value: 1 },
    { id: 'debut-before-2000', label: 'Debut înainte de 2000', type: 'debut-max', value: 1999 },
    { id: 'debut-2010-plus', label: 'Debut din 2010', type: 'debut-min', value: 2010 }
]);

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeId(value) {
    return normalizeString(value).toLowerCase();
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function hashString(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seedInput) {
    let seed = hashString(seedInput) || 0x9e3779b9;
    return function seededRandom() {
        seed += 0x6D2B79F5;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function sampleUnique(values, count, random = Math.random) {
    return shuffle(values, random).slice(0, Math.max(0, count));
}

function normalizeDriver(driver) {
    if (!driver || typeof driver !== 'object') return null;
    const id = normalizeString(driver.id).toUpperCase();
    const name = normalizeString(driver.name);
    if (!id || !name) return null;
    const team = Array.isArray(driver.team)
        ? driver.team.map(normalizeString).filter(Boolean)
        : [normalizeString(driver.team)].filter(Boolean);
    return Object.freeze({
        id,
        name,
        nat: normalizeString(driver.nat).toUpperCase(),
        team: Object.freeze(team),
        age: safeInteger(driver.age, 0),
        debut: safeInteger(driver.debut, 0),
        wins: Math.max(0, safeInteger(driver.wins, 0)),
        difficulty: normalizeString(driver.difficulty).toLowerCase() || 'all'
    });
}

function normalizeDrivers(drivers) {
    const seen = new Set();
    const normalized = [];
    for (const driver of Array.isArray(drivers) ? drivers : []) {
        const entry = normalizeDriver(driver);
        if (!entry || seen.has(entry.id)) continue;
        seen.add(entry.id);
        normalized.push(entry);
    }
    return Object.freeze(normalized);
}

function publicDriver(driver) {
    if (!driver) return null;
    return {
        id: driver.id,
        name: driver.name,
        nat: driver.nat,
        team: [...driver.team],
        age: driver.age,
        debut: driver.debut,
        wins: driver.wins,
        difficulty: driver.difficulty
    };
}

function publicConstructor(constructor) {
    if (!constructor) return null;
    return {
        id: constructor.id,
        name: constructor.name,
        country: constructor.country,
        debut: constructor.debut,
        championships: constructor.championships,
        active: constructor.active,
        era: constructor.era
    };
}

function publicTrack(track, { includeLayout = false } = {}) {
    if (!track) return null;
    const payload = {
        id: track.id,
        name: track.name,
        country: track.country,
        firstGrandPrix: track.firstGrandPrix,
        lengthKm: track.lengthKm,
        corners: track.corners,
        direction: track.direction
    };
    if (includeLayout) payload.layout = track.layout.map(point => [...point]);
    return payload;
}

function getCurrentTeam(driver) {
    return Array.isArray(driver?.team) && driver.team.length > 0 ? driver.team[0] : '—';
}

function numericState(guessValue, targetValue) {
    if (guessValue === targetValue) return 'green';
    return targetValue > guessValue ? 'orange' : 'purple';
}

function exactState(guessValue, targetValue) {
    return guessValue === targetValue ? 'green' : 'red';
}

function buildDriverFeedback(guess, target) {
    const results = compareGuess(guess, target);
    return {
        entityType: 'driver',
        guess: publicDriver(guess),
        cells: [
            { key: 'name', label: 'Pilot', value: guess.name, state: results.name },
            { key: 'nat', label: 'Țară', value: guess.nat, state: results.nat },
            { key: 'team', label: 'Echipă', value: getCurrentTeam(guess), state: results.team },
            { key: 'age', label: 'Vârstă', value: guess.age, state: results.age },
            { key: 'debut', label: 'Debut', value: guess.debut, state: results.debut },
            { key: 'wins', label: 'Victorii', value: guess.wins, state: results.wins }
        ]
    };
}

function buildConstructorFeedback(guess, target) {
    return {
        entityType: 'constructor',
        guess: publicConstructor(guess),
        cells: [
            { key: 'name', label: 'Constructor', value: guess.name, state: exactState(guess.id, target.id) },
            { key: 'country', label: 'Țară', value: guess.country, state: exactState(guess.country, target.country) },
            { key: 'debut', label: 'Debut', value: guess.debut, state: numericState(guess.debut, target.debut) },
            { key: 'championships', label: 'Titluri', value: guess.championships, state: numericState(guess.championships, target.championships) },
            { key: 'active', label: 'Status', value: guess.active ? 'Activ' : 'Istoric', state: exactState(guess.active, target.active) },
            { key: 'era', label: 'Eră', value: guess.era, state: exactState(guess.era, target.era) }
        ]
    };
}

function buildTrackFeedback(guess, target) {
    return {
        entityType: 'track',
        guess: publicTrack(guess),
        cells: [
            { key: 'name', label: 'Circuit', value: guess.name, state: exactState(guess.id, target.id) },
            { key: 'country', label: 'Țară', value: guess.country, state: exactState(guess.country, target.country) },
            { key: 'firstGrandPrix', label: 'Primul GP', value: guess.firstGrandPrix, state: numericState(guess.firstGrandPrix, target.firstGrandPrix) },
            { key: 'lengthKm', label: 'Lungime', value: `${guess.lengthKm.toFixed(3)} km`, state: numericState(guess.lengthKm, target.lengthKm) },
            { key: 'corners', label: 'Viraje', value: guess.corners, state: numericState(guess.corners, target.corners) },
            { key: 'direction', label: 'Sens', value: guess.direction === 'clockwise' ? 'Orar' : 'Antiorar', state: exactState(guess.direction, target.direction) }
        ]
    };
}

function findEra(key) {
    return ERA_FILTERS.find(era => era.key === normalizeId(key)) || ERA_FILTERS.at(-1);
}

function filterDriversByEra(drivers, eraKey) {
    const era = findEra(eraKey);
    return drivers.filter(driver => driver.debut >= era.from && driver.debut <= era.to);
}

function filterDriversByDifficulty(drivers, difficulty) {
    const normalized = normalizeId(difficulty);
    if (!['easy', 'medium', 'hard'].includes(normalized)) return [...drivers];
    const filtered = drivers.filter(driver => driver.difficulty === normalized);
    return filtered.length > 0 ? filtered : [...drivers];
}

function matchesSudokuCriterion(driver, criterion) {
    if (!driver || !criterion) return false;
    switch (criterion.type) {
        case 'team':
            return driver.team.includes(criterion.value);
        case 'nat':
            return driver.nat === criterion.value;
        case 'wins-min':
            return driver.wins >= criterion.value;
        case 'debut-max':
            return driver.debut <= criterion.value;
        case 'debut-min':
            return driver.debut >= criterion.value;
        default:
            return false;
    }
}

function buildSudokuCandidates(drivers, rows, columns) {
    return Array.from({ length: 9 }, (_, cellIndex) => {
        const rowIndex = Math.floor(cellIndex / 3);
        const columnIndex = cellIndex % 3;
        return drivers.filter(driver => (
            matchesSudokuCriterion(driver, rows[rowIndex])
            && matchesSudokuCriterion(driver, columns[columnIndex])
        ));
    });
}

function findDistinctSudokuSolution(candidateLists, random = Math.random) {
    const assignments = Array(9).fill(null);
    const used = new Set();

    function solve(remainingIndices) {
        if (remainingIndices.length === 0) return true;
        const sorted = [...remainingIndices].sort((left, right) => {
            const leftCount = candidateLists[left].filter(candidate => !used.has(candidate.id)).length;
            const rightCount = candidateLists[right].filter(candidate => !used.has(candidate.id)).length;
            return leftCount - rightCount;
        });
        const cellIndex = sorted[0];
        const nextRemaining = remainingIndices.filter(index => index !== cellIndex);
        const candidates = shuffle(candidateLists[cellIndex], random).filter(candidate => !used.has(candidate.id));
        for (const candidate of candidates) {
            assignments[cellIndex] = candidate;
            used.add(candidate.id);
            if (solve(nextRemaining)) return true;
            used.delete(candidate.id);
            assignments[cellIndex] = null;
        }
        return false;
    }

    return solve([...Array(9).keys()]) ? assignments : null;
}

function createSudokuPuzzle(drivers, random = Math.random) {
    const rowCombos = shuffle(SUDOKU_ROW_CRITERIA, random);
    const columnCombos = shuffle(SUDOKU_COLUMN_CRITERIA, random);

    for (let rowStart = 0; rowStart <= rowCombos.length - 3; rowStart++) {
        const rows = rowCombos.slice(rowStart, rowStart + 3);
        for (let columnStart = 0; columnStart <= columnCombos.length - 3; columnStart++) {
            const columns = columnCombos.slice(columnStart, columnStart + 3);
            const candidates = buildSudokuCandidates(drivers, rows, columns);
            if (candidates.some(list => list.length === 0)) continue;
            const solution = findDistinctSudokuSolution(candidates, random);
            if (solution) {
                return {
                    rows: rows.map(criterion => ({ ...criterion })),
                    columns: columns.map(criterion => ({ ...criterion })),
                    candidates,
                    solution
                };
            }
        }
    }

    throw new Error('Nu există suficiente combinații distincte pentru Pilot Sudoku.');
}

function getTargetById(catalog, id) {
    const normalized = normalizeId(id);
    return catalog.find(item => normalizeId(item.id) === normalized) || null;
}

function getRemainingSeconds(session, clock = Date.now) {
    if (!Number.isFinite(session?.expiresAt)) return null;
    return Math.max(0, Math.ceil((session.expiresAt - clock()) / 1000));
}

function isTimedOut(session, clock = Date.now) {
    return Number.isFinite(session?.expiresAt) && clock() >= session.expiresAt;
}

function getSessionCatalog(session) {
    return session.catalog || [];
}

function getCurrentTarget(session) {
    if (session.variantKey === EXTENDED_VARIANTS.STREAK) return session.currentTarget || null;
    return session.targets?.[session.roundIndex] || null;
}

function buildRoundPublicState(session, clock = Date.now) {
    if (session.variantKey === EXTENDED_VARIANTS.PILOT_SUDOKU) return null;
    const target = getCurrentTarget(session);
    const state = {
        roundNumber: session.roundIndex + 1,
        totalRounds: Number.isInteger(session.totalRounds) ? session.totalRounds : null,
        attempts: session.attempts,
        maxAttempts: session.maxAttempts,
        score: session.score,
        streak: session.streak || 0,
        remainingSeconds: getRemainingSeconds(session, clock),
        awaitingAdvance: Boolean(session.awaitingAdvance)
    };
    if (session.variantKey === EXTENDED_VARIANTS.TRACK && target) {
        state.clue = { type: 'track-layout', layout: target.layout.map(point => [...point]) };
    }
    return state;
}

function buildSudokuPublicState(session) {
    return {
        rows: session.sudoku.rows.map(({ id, label }) => ({ id, label })),
        columns: session.sudoku.columns.map(({ id, label }) => ({ id, label })),
        placements: session.sudoku.placements.map(driver => driver ? publicDriver(driver) : null),
        activeCount: session.sudoku.placements.filter(Boolean).length,
        mistakes: session.sudoku.mistakes,
        score: session.score
    };
}

function buildSessionState(session, clock = Date.now) {
    return {
        sessionId: session.id,
        variantKey: session.variantKey,
        phase: session.phase,
        score: session.score,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt || null,
        challengeId: session.challengeId || null,
        weekKey: session.weekKey || null,
        difficulty: session.difficulty || session.options?.difficulty || null,
        era: session.era ? clone(session.era) : null,
        bestMetric: session.variantKey === EXTENDED_VARIANTS.STREAK ? session.streak : session.score,
        round: buildRoundPublicState(session, clock),
        sudoku: session.variantKey === EXTENDED_VARIANTS.PILOT_SUDOKU ? buildSudokuPublicState(session) : null
    };
}

function buildCatalogPayload(session) {
    if (session.entityType === 'driver') return getSessionCatalog(session).map(publicDriver);
    if (session.entityType === 'constructor') return getSessionCatalog(session).map(publicConstructor);
    if (session.entityType === 'track') return getSessionCatalog(session).map(track => publicTrack(track));
    return [];
}

function createExtendedModesService({
    drivers,
    constructors = CONSTRUCTORS,
    tracks = TRACKS,
    clock = Date.now,
    random = Math.random
} = {}) {
    const driverCatalog = normalizeDrivers(drivers);
    const constructorCatalog = Object.freeze([...constructors]);
    const trackCatalog = Object.freeze([...tracks]);
    let sessionSequence = 0;

    if (driverCatalog.length < 20) {
        throw new Error('Extended modes require at least 20 valid drivers.');
    }

    function createSessionId(variantKey) {
        sessionSequence += 1;
        return `extended-${variantKey}-${clock().toString(36)}-${sessionSequence.toString(36)}`;
    }

    function baseSession(variantKey, entityType, catalog, options = {}) {
        const startedAt = clock();
        return {
            id: createSessionId(variantKey),
            variantKey,
            entityType,
            catalog,
            options: { ...options },
            startedAt,
            phase: 'playing',
            score: 0,
            attempts: 0,
            maxAttempts: MAX_DRIVER_ATTEMPTS,
            roundIndex: 0,
            totalRounds: 1,
            targets: [],
            currentTarget: null,
            awaitingAdvance: false,
            streak: 0,
            results: [],
            lastActionAt: 0,
            expiresAt: null,
            finishReason: null
        };
    }

    function createSpeedRun(options = {}) {
        const pool = filterDriversByDifficulty(driverCatalog, options.difficulty);
        const roundCount = Math.min(SPEED_RUN_ROUNDS, pool.length);
        const session = baseSession(EXTENDED_VARIANTS.SPEED_RUN, 'driver', pool, options);
        session.totalRounds = roundCount;
        session.targets = sampleUnique(pool, roundCount, random);
        session.maxAttempts = MAX_DRIVER_ATTEMPTS;
        session.expiresAt = session.startedAt + SPEED_RUN_SECONDS * 1000;
        return session;
    }

    function createEraChallenge(options = {}) {
        const era = findEra(options.eraKey);
        const eraPool = filterDriversByEra(driverCatalog, era.key);
        const pool = eraPool.length > 0 ? eraPool : [...driverCatalog];
        const session = baseSession(EXTENDED_VARIANTS.ERA, 'driver', pool, options);
        session.era = era;
        session.targets = sampleUnique(pool, 1, random);
        return session;
    }

    function createStreak(options = {}) {
        const pool = filterDriversByDifficulty(driverCatalog, options.difficulty);
        const session = baseSession(EXTENDED_VARIANTS.STREAK, 'driver', pool, options);
        session.totalRounds = null;
        session.maxAttempts = STREAK_ATTEMPTS;
        session.currentTarget = sampleUnique(pool, 1, random)[0];
        session.usedTargetIds = new Set([session.currentTarget.id]);
        return session;
    }

    function createWeekly(options = {}) {
        const difficulty = normalizeWeeklyDifficulty(options.difficulty);
        if (!difficulty) throw new Error('Weekly Challenge requires a valid difficulty.');

        const challengeDate = options.date || new Date(clock());
        const weekInfo = getIsoWeekInfo(challengeDate);
        const pool = filterDriversByDifficulty(driverCatalog, difficulty);
        if (pool.length < WEEKLY_ROUNDS) {
            throw new Error(`Weekly Challenge requires at least ${WEEKLY_ROUNDS} drivers for ${difficulty}.`);
        }

        const challengeId = getWeeklyChallengeId(difficulty, challengeDate);
        const seededRandom = createSeededRandom(challengeId);
        const session = baseSession(EXTENDED_VARIANTS.WEEKLY, 'driver', pool, options);
        session.challengeId = challengeId;
        session.weekKey = weekInfo.key;
        session.difficulty = difficulty;
        session.totalRounds = WEEKLY_ROUNDS;
        session.targets = sampleUnique(pool, WEEKLY_ROUNDS, seededRandom);
        session.expiresAt = session.startedAt + WEEKLY_SECONDS * 1000;
        return session;
    }

    function createConstructorGuesser(options = {}) {
        const session = baseSession(EXTENDED_VARIANTS.CONSTRUCTOR, 'constructor', constructorCatalog, options);
        session.targets = sampleUnique(constructorCatalog, 1, random);
        return session;
    }

    function createTrackGuesser(options = {}) {
        const session = baseSession(EXTENDED_VARIANTS.TRACK, 'track', trackCatalog, options);
        session.targets = sampleUnique(trackCatalog, 1, random);
        return session;
    }

    function createPilotSudoku(options = {}) {
        const session = baseSession(EXTENDED_VARIANTS.PILOT_SUDOKU, 'driver', driverCatalog, options);
        const puzzleRandom = options.seed
            ? createSeededRandom(options.seed)
            : random;
        const puzzle = createSudokuPuzzle(driverCatalog, puzzleRandom);
        session.sudoku = {
            rows: puzzle.rows,
            columns: puzzle.columns,
            candidates: puzzle.candidates,
            solution: puzzle.solution,
            placements: Array(9).fill(null),
            mistakes: 0,
            usedDriverIds: new Set()
        };
        session.maxAttempts = null;
        session.targets = [];
        return session;
    }

    function startSession(variantKey, options = {}) {
        const normalizedVariant = normalizeId(variantKey);
        switch (normalizedVariant) {
            case EXTENDED_VARIANTS.SPEED_RUN:
                return createSpeedRun(options);
            case EXTENDED_VARIANTS.ERA:
                return createEraChallenge(options);
            case EXTENDED_VARIANTS.STREAK:
                return createStreak(options);
            case EXTENDED_VARIANTS.WEEKLY:
                return createWeekly(options);
            case EXTENDED_VARIANTS.CONSTRUCTOR:
                return createConstructorGuesser(options);
            case EXTENDED_VARIANTS.PILOT_SUDOKU:
                return createPilotSudoku(options);
            case EXTENDED_VARIANTS.TRACK:
                return createTrackGuesser(options);
            default:
                return null;
        }
    }

    function calculateCorrectScore(session) {
        const remainingAttempts = Math.max(0, session.maxAttempts - session.attempts);
        const remainingSeconds = getRemainingSeconds(session, clock) || 0;
        switch (session.variantKey) {
            case EXTENDED_VARIANTS.SPEED_RUN:
            case EXTENDED_VARIANTS.WEEKLY:
                return 1000 + remainingAttempts * 100 + remainingSeconds * 5;
            case EXTENDED_VARIANTS.STREAK:
                return 600 + session.streak * 100 + remainingAttempts * 75;
            case EXTENDED_VARIANTS.ERA:
                return 1200 + remainingAttempts * 120;
            case EXTENDED_VARIANTS.CONSTRUCTOR:
            case EXTENDED_VARIANTS.TRACK:
                return 1200 + remainingAttempts * 150;
            default:
                return 1000;
        }
    }

    function finishSession(session, reason, target = getCurrentTarget(session)) {
        session.phase = 'finished';
        session.awaitingAdvance = false;
        session.finishReason = reason;
        session.finishedAt = clock();
        session.finalTarget = target || null;
        return buildFinishedPayload(session);
    }

    function buildStartedPayload(session) {
        return {
            variantKey: session.variantKey,
            catalog: buildCatalogPayload(session),
            state: buildSessionState(session, clock),
            eras: session.variantKey === EXTENDED_VARIANTS.ERA ? ERA_FILTERS.map(clone) : undefined
        };
    }

    function buildRoundReadyPayload(session) {
        return {
            variantKey: session.variantKey,
            state: buildSessionState(session, clock)
        };
    }

    function buildFinishedPayload(session) {
        let target = session.finalTarget || getCurrentTarget(session);
        if (session.entityType === 'driver') target = publicDriver(target);
        else if (session.entityType === 'constructor') target = publicConstructor(target);
        else if (session.entityType === 'track') target = publicTrack(target, { includeLayout: true });
        else target = null;

        return {
            variantKey: session.variantKey,
            reason: session.finishReason || 'completed',
            score: session.score,
            streak: session.streak || 0,
            roundsCompleted: session.results.filter(result => result.correct).length,
            roundsPlayed: session.results.length,
            totalRounds: session.totalRounds,
            durationMs: Math.max(0, (session.finishedAt || clock()) - session.startedAt),
            challengeId: session.challengeId || null,
            weekKey: session.weekKey || null,
            difficulty: session.difficulty || session.options?.difficulty || null,
            era: session.era ? clone(session.era) : null,
            target,
            sudoku: session.variantKey === EXTENDED_VARIANTS.PILOT_SUDOKU
                ? buildSudokuPublicState(session)
                : null
        };
    }

    function getFeedback(session, guess, target) {
        if (session.entityType === 'driver') return buildDriverFeedback(guess, target);
        if (session.entityType === 'constructor') return buildConstructorFeedback(guess, target);
        if (session.entityType === 'track') return buildTrackFeedback(guess, target);
        return null;
    }

    function findGuess(session, guessId) {
        return getTargetById(getSessionCatalog(session), guessId);
    }

    function recordRound(session, { correct, skipped = false, target, attempts, points = 0 }) {
        session.results.push({
            roundNumber: session.roundIndex + 1,
            correct: Boolean(correct),
            skipped: Boolean(skipped),
            targetId: target?.id || null,
            attempts,
            points
        });
    }

    function completeCurrentRound(session, { correct, skipped = false, feedback = null }) {
        const target = getCurrentTarget(session);
        let points = 0;
        if (correct) {
            if (session.variantKey === EXTENDED_VARIANTS.STREAK) session.streak += 1;
            points = calculateCorrectScore(session);
            session.score += points;
        }
        if (skipped) session.score = Math.max(0, session.score - SKIP_PENALTY);
        recordRound(session, { correct, skipped, target, attempts: session.attempts, points });

        const isLastFixedRound = Number.isInteger(session.totalRounds)
            && session.roundIndex >= session.totalRounds - 1;
        const singleRoundMode = [
            EXTENDED_VARIANTS.ERA,
            EXTENDED_VARIANTS.CONSTRUCTOR,
            EXTENDED_VARIANTS.TRACK
        ].includes(session.variantKey);

        if (session.variantKey === EXTENDED_VARIANTS.STREAK && !correct) {
            return {
                finished: true,
                payload: finishSession(session, 'streak-ended', target)
            };
        }
        if (singleRoundMode || isLastFixedRound) {
            return {
                finished: true,
                payload: finishSession(session, correct ? 'completed' : skipped ? 'skipped' : 'failed', target)
            };
        }

        session.awaitingAdvance = true;
        return {
            finished: false,
            payload: {
                variantKey: session.variantKey,
                feedback,
                isCorrect: Boolean(correct),
                skipped: Boolean(skipped),
                target: session.entityType === 'driver'
                    ? publicDriver(target)
                    : session.entityType === 'constructor'
                        ? publicConstructor(target)
                        : publicTrack(target, { includeLayout: true }),
                points,
                state: buildSessionState(session, clock)
            }
        };
    }

    function submitGuess(session, guessId) {
        if (!session || session.phase !== 'playing') return { error: 'Sesiunea nu este activă.' };
        if (session.variantKey === EXTENDED_VARIANTS.PILOT_SUDOKU) {
            return { error: 'Pilot Sudoku folosește validarea pe celule.' };
        }
        if (session.awaitingAdvance) return { error: 'Continuă la următoarea rundă înainte de o nouă încercare.' };
        if (isTimedOut(session, clock)) {
            return { finished: true, payload: finishSession(session, 'time-expired') };
        }

        const guess = findGuess(session, guessId);
        if (!guess) return { error: 'Selecția nu este validă pentru acest mod.' };
        const target = getCurrentTarget(session);
        if (!target) return { error: 'Ținta rundei nu este disponibilă.' };

        session.attempts += 1;
        const correct = normalizeId(guess.id) === normalizeId(target.id);
        const feedback = getFeedback(session, guess, target);
        const exhausted = session.attempts >= session.maxAttempts;

        if (correct || exhausted) {
            const completion = completeCurrentRound(session, { correct, feedback });
            if (completion.finished) {
                return {
                    finished: true,
                    feedback,
                    isCorrect: correct,
                    payload: completion.payload
                };
            }
            return {
                finished: false,
                roundComplete: true,
                payload: completion.payload
            };
        }

        return {
            finished: false,
            roundComplete: false,
            payload: {
                variantKey: session.variantKey,
                feedback,
                isCorrect: false,
                state: buildSessionState(session, clock)
            }
        };
    }

    function continueSession(session) {
        if (!session || session.phase !== 'playing') return { error: 'Sesiunea nu este activă.' };
        if (!session.awaitingAdvance) return { error: 'Runda curentă nu este încă finalizată.' };
        if (isTimedOut(session, clock)) {
            return { finished: true, payload: finishSession(session, 'time-expired') };
        }

        session.awaitingAdvance = false;
        session.attempts = 0;
        if (session.variantKey === EXTENDED_VARIANTS.STREAK) {
            let available = session.catalog.filter(driver => !session.usedTargetIds.has(driver.id));
            if (available.length === 0) {
                session.usedTargetIds.clear();
                available = [...session.catalog];
            }
            session.currentTarget = sampleUnique(available, 1, random)[0];
            session.usedTargetIds.add(session.currentTarget.id);
            session.roundIndex += 1;
        } else {
            session.roundIndex += 1;
        }
        return { finished: false, payload: buildRoundReadyPayload(session) };
    }

    function skipRound(session) {
        if (!session || session.phase !== 'playing') return { error: 'Sesiunea nu este activă.' };
        if (![EXTENDED_VARIANTS.SPEED_RUN, EXTENDED_VARIANTS.WEEKLY].includes(session.variantKey)) {
            return { error: 'Skip este disponibil doar în Speed Run și Weekly Challenge.' };
        }
        if (session.awaitingAdvance) return { error: 'Runda este deja finalizată.' };
        if (isTimedOut(session, clock)) {
            return { finished: true, payload: finishSession(session, 'time-expired') };
        }
        const completion = completeCurrentRound(session, { correct: false, skipped: true });
        return completion.finished
            ? { finished: true, payload: completion.payload }
            : { finished: false, roundComplete: true, payload: completion.payload };
    }

    function submitSudokuGuess(session, cellIndexInput, driverId) {
        if (!session || session.phase !== 'playing' || session.variantKey !== EXTENDED_VARIANTS.PILOT_SUDOKU) {
            return { error: 'Pilot Sudoku nu este activ.' };
        }
        const cellIndex = Number(cellIndexInput);
        if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
            return { error: 'Celula Sudoku nu este validă.' };
        }
        if (session.sudoku.placements[cellIndex]) {
            return { error: 'Celula este deja completată.' };
        }
        const driver = getTargetById(session.catalog, driverId);
        if (!driver) return { error: 'Pilotul selectat nu este valid.' };
        if (session.sudoku.usedDriverIds.has(driver.id)) {
            return { error: 'Același pilot nu poate fi folosit de două ori.' };
        }

        const rowIndex = Math.floor(cellIndex / 3);
        const columnIndex = cellIndex % 3;
        const matches = matchesSudokuCriterion(driver, session.sudoku.rows[rowIndex])
            && matchesSudokuCriterion(driver, session.sudoku.columns[columnIndex]);
        if (!matches) {
            session.sudoku.mistakes += 1;
            session.score = Math.max(0, session.score - 25);
            return {
                finished: false,
                correct: false,
                payload: {
                    variantKey: session.variantKey,
                    cellIndex,
                    correct: false,
                    state: buildSessionState(session, clock)
                }
            };
        }

        session.sudoku.placements[cellIndex] = driver;
        session.sudoku.usedDriverIds.add(driver.id);
        session.score += 100;
        const completed = session.sudoku.placements.every(Boolean);
        if (completed) {
            session.score += 500;
            session.results.push({ correct: true, attempts: session.sudoku.mistakes + 9, points: session.score });
            return {
                finished: true,
                correct: true,
                payload: finishSession(session, 'completed', null)
            };
        }

        return {
            finished: false,
            correct: true,
            payload: {
                variantKey: session.variantKey,
                cellIndex,
                correct: true,
                driver: publicDriver(driver),
                state: buildSessionState(session, clock)
            }
        };
    }

    function expireSession(session) {
        if (!session || session.phase !== 'playing') return null;
        if (!isTimedOut(session, clock)) return null;
        return finishSession(session, 'time-expired');
    }

    return {
        EXTENDED_VARIANTS,
        ERA_FILTERS,
        buildFinishedPayload,
        buildSessionState: session => buildSessionState(session, clock),
        buildStartedPayload,
        continueSession,
        expireSession,
        getIsoWeekInfo,
        isTimedOut: session => isTimedOut(session, clock),
        skipRound,
        startSession,
        submitGuess,
        submitSudokuGuess
    };
}

module.exports = {
    ERA_FILTERS,
    EXTENDED_VARIANTS,
    EXTENDED_VARIANT_KEYS,
    MAX_DRIVER_ATTEMPTS,
    SKIP_PENALTY,
    SPEED_RUN_ROUNDS,
    SPEED_RUN_SECONDS,
    STREAK_ATTEMPTS,
    WEEKLY_ROUNDS,
    WEEKLY_SECONDS,
    buildConstructorFeedback,
    buildDriverFeedback,
    buildSudokuCandidates,
    buildTrackFeedback,
    createExtendedModesService,
    createSeededRandom,
    createSudokuPuzzle,
    filterDriversByEra,
    findDistinctSudokuSolution,
    getIsoWeekInfo,
    matchesSudokuCriterion,
    normalizeDrivers,
    sampleUnique,
    shuffle
};
