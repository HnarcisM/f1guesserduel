const DEFAULT_DUEL_BEST_OF = 3;
const DUEL_BEST_OF_OPTIONS = Object.freeze([3, 5, 7]);
const DUEL_MATCH_STATUSES = new Set(['waiting', 'active', 'finished']);

function normalizeDuelBestOf(value, fallback = DEFAULT_DUEL_BEST_OF) {
    const parsed = Number(value);
    if (DUEL_BEST_OF_OPTIONS.includes(parsed)) return parsed;

    const fallbackParsed = Number(fallback);
    return DUEL_BEST_OF_OPTIONS.includes(fallbackParsed)
        ? fallbackParsed
        : DEFAULT_DUEL_BEST_OF;
}

function getDuelWinsRequired(bestOf) {
    return Math.floor(normalizeDuelBestOf(bestOf) / 2) + 1;
}

function createDuelMatchState(bestOf = DEFAULT_DUEL_BEST_OF) {
    const normalizedBestOf = normalizeDuelBestOf(bestOf);
    return {
        bestOf: normalizedBestOf,
        winsRequired: getDuelWinsRequired(normalizedBestOf),
        status: 'waiting',
        roundsPlayed: 0,
        draws: 0,
        winnerUsername: null,
        startedAt: null,
        finishedAt: null
    };
}

function ensureDuelMatchState(room) {
    if (!room) return createDuelMatchState();

    const bestOf = normalizeDuelBestOf(
        room.lobbyBestOf ?? room.matchState?.bestOf,
        DEFAULT_DUEL_BEST_OF
    );
    room.lobbyBestOf = bestOf;

    if (!room.matchState || typeof room.matchState !== 'object') {
        room.matchState = createDuelMatchState(bestOf);
        return room.matchState;
    }

    const state = room.matchState;
    state.bestOf = bestOf;
    state.winsRequired = getDuelWinsRequired(bestOf);
    state.status = DUEL_MATCH_STATUSES.has(state.status) ? state.status : 'waiting';
    state.roundsPlayed = Number.isSafeInteger(state.roundsPlayed) && state.roundsPlayed >= 0
        ? state.roundsPlayed
        : 0;
    state.draws = Number.isSafeInteger(state.draws) && state.draws >= 0
        ? state.draws
        : 0;
    state.winnerUsername = typeof state.winnerUsername === 'string' && state.winnerUsername.trim()
        ? state.winnerUsername
        : null;
    state.startedAt = Number.isFinite(state.startedAt) ? state.startedAt : null;
    state.finishedAt = Number.isFinite(state.finishedAt) ? state.finishedAt : null;

    if (state.status !== 'finished') {
        state.winnerUsername = null;
        state.finishedAt = null;
    }

    return state;
}

function buildPublicDuelMatch(room) {
    const state = ensureDuelMatchState(room);
    return {
        bestOf: state.bestOf,
        winsRequired: state.winsRequired,
        status: state.status,
        roundsPlayed: state.roundsPlayed,
        draws: state.draws,
        winnerUsername: state.winnerUsername,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt
    };
}

function resetDuelMatch(room, options = {}) {
    if (!room) return null;

    const bestOf = normalizeDuelBestOf(
        options.bestOf ?? room.lobbyBestOf ?? room.matchState?.bestOf,
        DEFAULT_DUEL_BEST_OF
    );
    room.lobbyBestOf = bestOf;
    room.matchState = createDuelMatchState(bestOf);
    room.scoreboard = {};
    return room.matchState;
}

function updateDuelMatchFormat(room, bestOf) {
    if (!room) return { changed: false, reason: 'room-missing' };

    const parsed = Number(bestOf);
    if (!DUEL_BEST_OF_OPTIONS.includes(parsed)) {
        return { changed: false, reason: 'invalid-best-of' };
    }

    const currentBestOf = ensureDuelMatchState(room).bestOf;
    if (currentBestOf === parsed) {
        return { changed: false, bestOf: currentBestOf, matchReset: false };
    }

    resetDuelMatch(room, { bestOf: parsed });
    return { changed: true, bestOf: parsed, matchReset: true };
}

function markDuelMatchStarted(room, now = Date.now()) {
    const state = ensureDuelMatchState(room);
    if (state.status === 'finished') return false;

    state.status = 'active';
    if (!Number.isFinite(state.startedAt)) state.startedAt = now;
    return true;
}

function getCurrentMatchWinner(room) {
    const state = ensureDuelMatchState(room);
    const players = Object.values(room?.players || {});

    for (const player of players) {
        const scoreKey = player?.scoreKey;
        const entry = scoreKey ? room?.scoreboard?.[scoreKey] : null;
        const wins = Number.isSafeInteger(entry?.wins) ? entry.wins : 0;
        if (wins >= state.winsRequired) {
            return {
                username: player.username || entry?.username || 'Guest',
                wins
            };
        }
    }

    return null;
}

function applyRoundToDuelMatch(room, roundResult, now = Date.now()) {
    if (!room || !roundResult || roundResult.matchApplied) return false;
    if (!roundResult.allPlayersFinished || roundResult.status === 'aborted') return false;

    const state = ensureDuelMatchState(room);
    if (state.status === 'finished') {
        roundResult.matchApplied = true;
        roundResult.match = buildPublicDuelMatch(room);
        return false;
    }

    markDuelMatchStarted(room, now);
    state.roundsPlayed += 1;
    if (roundResult.status === 'draw') state.draws += 1;

    const winner = getCurrentMatchWinner(room);
    if (winner) {
        state.status = 'finished';
        state.winnerUsername = winner.username;
        state.finishedAt = now;
    }

    roundResult.matchApplied = true;
    roundResult.match = buildPublicDuelMatch(room);
    return true;
}

function isDuelMatchFinished(room) {
    return ensureDuelMatchState(room).status === 'finished';
}

module.exports = {
    DEFAULT_DUEL_BEST_OF,
    DUEL_BEST_OF_OPTIONS,
    normalizeDuelBestOf,
    getDuelWinsRequired,
    createDuelMatchState,
    ensureDuelMatchState,
    buildPublicDuelMatch,
    resetDuelMatch,
    updateDuelMatchFormat,
    markDuelMatchStarted,
    applyRoundToDuelMatch,
    isDuelMatchFinished
};
