'use strict';

const { EXTENDED_VARIANTS } = require('./extendedModesConstants');
const {
    clone,
    publicConstructor,
    publicDriver,
    publicTrack
} = require('./extendedModesModel');

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

module.exports = {
    buildCatalogPayload,
    buildRoundPublicState,
    buildSessionState,
    buildSudokuPublicState,
    getCurrentTarget,
    getRemainingSeconds,
    getSessionCatalog,
    isTimedOut
};
