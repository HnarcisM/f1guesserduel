'use strict';

const { CONSTRUCTORS, TRACKS } = require('./extendedModesCatalogs');
const {
    ERA_FILTERS,
    EXTENDED_VARIANTS,
    EXTENDED_VARIANT_KEYS,
    MAX_DRIVER_ATTEMPTS,
    SKIP_PENALTY,
    SPEED_RUN_ROUNDS,
    SPEED_RUN_SECONDS,
    STREAK_ATTEMPTS,
    WEEKLY_ROUNDS,
    WEEKLY_SECONDS
} = require('./extendedModesConstants');
const {
    buildConstructorFeedback,
    buildDriverFeedback,
    buildTrackFeedback,
    clone,
    createSeededRandom,
    filterDriversByEra,
    getTargetById,
    normalizeDrivers,
    normalizeId,
    publicConstructor,
    publicDriver,
    publicTrack,
    sampleUnique,
    shuffle
} = require('./extendedModesModel');
const { createExtendedModesSessionFactory } = require('./extendedModesSessionFactory');
const {
    buildCatalogPayload,
    buildSessionState,
    buildSudokuPublicState,
    getCurrentTarget,
    getRemainingSeconds,
    getSessionCatalog,
    isTimedOut
} = require('./extendedModesSessionState');
const {
    buildSudokuCandidates,
    createSudokuPuzzle,
    findDistinctSudokuSolution,
    matchesSudokuCriterion
} = require('./extendedModesSudoku');
const { getIsoWeekInfo } = require('./weeklyChallenge');

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
    if (driverCatalog.length < 20) {
        throw new Error('Extended modes require at least 20 valid drivers.');
    }

    const { startSession } = createExtendedModesSessionFactory({
        driverCatalog,
        constructorCatalog,
        trackCatalog,
        clock,
        random
    });

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
