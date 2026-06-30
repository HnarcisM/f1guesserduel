const { MAX_PLAYERS_PER_ROOM } = require('../config/constants');

function serializeGuessEntry(entry) {
    return {
        attempt: entry.attempt,
        guess: entry.guess,
        results: entry.results,
        isCorrect: entry.isCorrect,
        isGameOver: entry.isGameOver
    };
}

function serializeRoomMember(member, options = {}) {
    const serialized = {
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        attempts: typeof member.attempts === 'number' ? member.attempts : 0,
        finished: Boolean(member.finished),
        timedOut: Boolean(member.timedOut)
    };

    if (options.includeGuesses) {
        serialized.guesses = Array.isArray(member.guesses) ? member.guesses.map(serializeGuessEntry) : [];
    }

    return serialized;
}

function serializeRoomMemberSummary(member) {
    return {
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        finished: Boolean(member.finished)
    };
}

function buildLiveBoardState(room) {
    return {
        roundState: room.roundState,
        isDailyChallenge: Boolean(room.isDailyChallenge),
        dailyDate: room.dailyDate || null,
        players: Object.values(room.players || {}).map(member => serializeRoomMember(member, { includeGuesses: true }))
    };
}

function buildPublicRoomState(room) {
    const players = Object.values(room.players || {}).map(serializeRoomMemberSummary);
    const spectators = Object.values(room.spectators || {}).map(serializeRoomMemberSummary);

    return {
        playerCount: players.length,
        spectatorCount: spectators.length,
        totalCount: players.length + spectators.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        roundState: room.roundState,
        difficulty: room.difficulty || null,
        isDailyChallenge: Boolean(room.isDailyChallenge),
        dailyDate: room.dailyDate || null,
        players,
        spectators
    };
}

module.exports = {
    serializeGuessEntry,
    serializeRoomMember,
    serializeRoomMemberSummary,
    buildLiveBoardState,
    buildPublicRoomState
};
