'use strict';

const {
    EXTENDED_VARIANTS,
    MAX_DRIVER_ATTEMPTS,
    SPEED_RUN_ROUNDS,
    SPEED_RUN_SECONDS,
    STREAK_ATTEMPTS,
    WEEKLY_ROUNDS,
    WEEKLY_SECONDS
} = require('./extendedModesConstants');
const {
    createSeededRandom,
    filterDriversByDifficulty,
    filterDriversByEra,
    findEra,
    normalizeId,
    sampleUnique
} = require('./extendedModesModel');
const { createSudokuPuzzle } = require('./extendedModesSudoku');
const {
    getIsoWeekInfo,
    getWeeklyChallengeId,
    normalizeWeeklyDifficulty
} = require('./weeklyChallenge');

function createExtendedModesSessionFactory({
    driverCatalog,
    constructorCatalog,
    trackCatalog,
    clock = Date.now,
    random = Math.random
}) {
    let sessionSequence = 0;

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
        const puzzleRandom = options.seed ? createSeededRandom(options.seed) : random;
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
        switch (normalizeId(variantKey)) {
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

    return { startSession };
}

module.exports = { createExtendedModesSessionFactory };
