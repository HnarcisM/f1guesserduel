const { MAX_ATTEMPTS } = require('../config/constants');
const MAX_DUEL_ROUND_HISTORY = 10;
const ROUND_REPLAY_VERSION = 1;
const VALID_ROUND_STATUSES = new Set(['win', 'draw']);
const VALID_PLAYER_OUTCOMES = new Set(['win', 'loss', 'draw']);

function normalizeText(value, fallback = null, maximumLength = 120) {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, maximumLength) : fallback;
}

function cloneJsonValue(value, depth = 0) {
    if (depth > 6 || value === null || value === undefined) return value ?? null;
    if (['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 32).map(item => cloneJsonValue(item, depth + 1));
    if (typeof value !== 'object') return null;

    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => typeof key === 'string' && key.length <= 80)
        .slice(0, 64)
        .map(([key, entryValue]) => [key, cloneJsonValue(entryValue, depth + 1)]));
}

function cloneDriverSummary(driver) {
    if (!driver || typeof driver !== 'object') return null;
    const id = normalizeText(driver.id, null, 24);
    const name = normalizeText(driver.name, null, 120);
    if (!id && !name) return null;

    return {
        id,
        name,
        nat: normalizeText(driver.nat, null, 12),
        team: Array.isArray(driver.team)
            ? driver.team.slice(0, 8).map(team => normalizeText(team, null, 80)).filter(Boolean)
            : normalizeText(driver.team, null, 80),
        age: Number.isFinite(driver.age) ? driver.age : null,
        debut: Number.isFinite(driver.debut) ? driver.debut : null,
        wins: Number.isFinite(driver.wins) ? driver.wins : null
    };
}

function cloneGuessEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
        attempt: Number.isSafeInteger(entry.attempt) && entry.attempt > 0 ? entry.attempt : 0,
        guess: cloneDriverSummary(entry.guess),
        results: cloneJsonValue(entry.results),
        isCorrect: entry.isCorrect === true,
        isGameOver: entry.isGameOver === true
    };
}

function normalizeScoreboard(scoreboard) {
    if (!Array.isArray(scoreboard)) return [];
    return scoreboard.slice(0, 2).map(entry => ({
        username: normalizeText(entry?.username, 'Guest', 80),
        wins: Number.isSafeInteger(entry?.wins) && entry.wins >= 0 ? entry.wins : 0
    }));
}

function normalizeMatchSnapshot(match) {
    const source = match && typeof match === 'object' ? match : {};
    const bestOf = [3, 5, 7].includes(Number(source.bestOf)) ? Number(source.bestOf) : 3;
    const status = ['waiting', 'active', 'finished'].includes(source.status) ? source.status : 'active';
    return {
        bestOf,
        winsRequired: Math.floor(bestOf / 2) + 1,
        status,
        roundsPlayed: Number.isSafeInteger(source.roundsPlayed) && source.roundsPlayed >= 0
            ? source.roundsPlayed
            : 0,
        draws: Number.isSafeInteger(source.draws) && source.draws >= 0 ? source.draws : 0,
        winnerUsername: status === 'finished'
            ? normalizeText(source.winnerUsername, null, 80)
            : null
    };
}

function normalizeHistoryPlayer(player) {
    if (!player || typeof player !== 'object') return null;
    const outcome = VALID_PLAYER_OUTCOMES.has(player.outcome) ? player.outcome : 'loss';
    return {
        username: normalizeText(player.username, 'Guest', 80),
        isHost: player.isHost === true,
        outcome,
        attempts: Number.isSafeInteger(player.attempts) && player.attempts >= 0 ? player.attempts : 0,
        timedOut: player.timedOut === true,
        isCorrect: player.isCorrect === true,
        guesses: Array.isArray(player.guesses)
            ? player.guesses.slice(0, MAX_ATTEMPTS).map(cloneGuessEntry).filter(Boolean)
            : []
    };
}

function normalizeRoundHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object' || !VALID_ROUND_STATUSES.has(entry.status)) return null;

    const sequence = Number.isSafeInteger(entry.sequence) && entry.sequence > 0 ? entry.sequence : 1;
    const resolvedAt = Number.isFinite(entry.resolvedAt) ? entry.resolvedAt : null;
    const startedAt = Number.isFinite(entry.startedAt) ? entry.startedAt : null;
    return {
        replayVersion: ROUND_REPLAY_VERSION,
        id: normalizeText(entry.id, `round-${resolvedAt || sequence}-${sequence}`, 160),
        sequence,
        status: entry.status,
        reason: normalizeText(entry.reason, null, 80),
        winnerUsername: entry.status === 'win'
            ? normalizeText(entry.winnerUsername, null, 80)
            : null,
        startedAt,
        resolvedAt,
        durationMs: Number.isFinite(entry.durationMs) && entry.durationMs >= 0
            ? entry.durationMs
            : startedAt && resolvedAt ? Math.max(0, resolvedAt - startedAt) : null,
        difficulty: normalizeText(entry.difficulty, null, 24),
        timed: entry.timed === true,
        timeLimitSeconds: entry.timed && Number.isFinite(entry.timeLimitSeconds)
            ? entry.timeLimitSeconds
            : null,
        target: cloneDriverSummary(entry.target),
        players: Array.isArray(entry.players)
            ? entry.players.slice(0, 2).map(normalizeHistoryPlayer).filter(Boolean)
            : [],
        scoreboard: normalizeScoreboard(entry.scoreboard),
        match: normalizeMatchSnapshot(entry.match)
    };
}

function normalizeRoundHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .slice(-MAX_DUEL_ROUND_HISTORY)
        .map(normalizeRoundHistoryEntry)
        .filter(Boolean);
}

function ensureRoundHistory(room) {
    if (!room) return [];
    room.roundHistory = normalizeRoundHistory(room.roundHistory);
    return room.roundHistory;
}

function getNextHistorySequence(history) {
    return history.reduce((maximum, entry) => Math.max(maximum, entry.sequence || 0), 0) + 1;
}

function buildHistoryPlayers(room, roundResult) {
    return (roundResult.players || []).map(resultPlayer => {
        const member = resultPlayer.socketId ? room.players?.[resultPlayer.socketId] : null;
        return normalizeHistoryPlayer({
            username: resultPlayer.username,
            isHost: resultPlayer.isHost,
            outcome: resultPlayer.outcome,
            attempts: resultPlayer.attempts,
            timedOut: resultPlayer.timedOut,
            isCorrect: resultPlayer.isCorrect,
            guesses: member?.guesses || []
        });
    }).filter(Boolean);
}

function buildScoreboardSnapshot(room) {
    return Object.values(room?.players || {}).map(player => {
        const entry = player.scoreKey ? room.scoreboard?.[player.scoreKey] : null;
        return {
            username: player.username || entry?.username || 'Guest',
            wins: Number.isSafeInteger(entry?.wins) ? entry.wins : 0
        };
    }).slice(0, 2);
}

function appendRoundHistory(room, roundResult) {
    if (!room || !roundResult || roundResult.historyApplied) return null;
    if (!roundResult.allPlayersFinished || !VALID_ROUND_STATUSES.has(roundResult.status)) return null;

    const history = ensureRoundHistory(room);
    const sequence = getNextHistorySequence(history);
    const resolvedAt = Number.isFinite(roundResult.resolvedAt) ? roundResult.resolvedAt : Date.now();
    const startedAt = Number.isFinite(room.roundStartedAt) ? room.roundStartedAt : null;
    const entry = normalizeRoundHistoryEntry({
        replayVersion: ROUND_REPLAY_VERSION,
        id: `round-${resolvedAt}-${sequence}`,
        sequence,
        status: roundResult.status,
        reason: roundResult.reason,
        winnerUsername: roundResult.winnerUsername,
        startedAt,
        resolvedAt,
        durationMs: startedAt ? Math.max(0, resolvedAt - startedAt) : null,
        difficulty: room.difficulty,
        timed: room.timed,
        timeLimitSeconds: room.timeLimitSeconds,
        target: room.targetDriver || roundResult.target,
        players: buildHistoryPlayers(room, roundResult),
        scoreboard: buildScoreboardSnapshot(room),
        match: roundResult.match || room.matchState
    });

    if (!entry) return null;
    history.push(entry);
    if (history.length > MAX_DUEL_ROUND_HISTORY) {
        history.splice(0, history.length - MAX_DUEL_ROUND_HISTORY);
    }
    roundResult.historyApplied = true;
    roundResult.historyEntryId = entry.id;
    return entry;
}

function buildPublicRoundHistory(room, options = {}) {
    const limit = Number.isSafeInteger(options.limit) && options.limit > 0
        ? Math.min(options.limit, MAX_DUEL_ROUND_HISTORY)
        : MAX_DUEL_ROUND_HISTORY;
    return ensureRoundHistory(room)
        .slice(-limit)
        .reverse()
        .map(entry => normalizeRoundHistoryEntry(entry));
}

module.exports = {
    MAX_DUEL_ROUND_HISTORY,
    ROUND_REPLAY_VERSION,
    appendRoundHistory,
    buildPublicRoundHistory,
    cloneDriverSummary,
    cloneGuessEntry,
    ensureRoundHistory,
    normalizeRoundHistory,
    normalizeRoundHistoryEntry
};
