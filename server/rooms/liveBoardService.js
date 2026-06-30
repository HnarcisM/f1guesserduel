const { MAX_PLAYERS_PER_ROOM } = require('../config/constants');

function serializeGuessEntry(entry) {
    return {
        attempt: entry.attempt,
        guess: entry.guess,
        results: entry.results,
        isCorrect: entry.isCorrect,
        isGameOver: entry.isGameOver,
        createdAt: entry.createdAt
    };
}

function serializeRoomMember(member, options = {}) {
    const serialized = {
        socketId: member.socketId,
        userId: member.userId,
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        connected: member.connected,
        attempts: typeof member.attempts === 'number' ? member.attempts : 0,
        finished: Boolean(member.finished),
        timedOut: Boolean(member.timedOut)
    };

    if (options.includeGuesses) {
        serialized.guesses = Array.isArray(member.guesses) ? member.guesses.map(serializeGuessEntry) : [];
    }

    return serialized;
}

function buildLiveBoardState(room) {
    return {
        roundState: room.roundState,
        players: Object.values(room.players || {}).map(member => serializeRoomMember(member, { includeGuesses: true }))
    };
}

function buildPublicRoomState(room) {
    const players = Object.values(room.players || {}).map(serializeRoomMember);
    const spectators = Object.values(room.spectators || {}).map(serializeRoomMember);

    return {
        playerCount: players.length,
        spectatorCount: spectators.length,
        totalCount: players.length + spectators.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        players,
        spectators
    };
}

module.exports = {
    serializeGuessEntry,
    serializeRoomMember,
    buildLiveBoardState,
    buildPublicRoomState
};
