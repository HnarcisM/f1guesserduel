const { MAX_PLAYERS_PER_ROOM, DEFAULT_TIME_LIMIT_SECONDS } = require('../config/constants');
const { buildPublicRoundResult } = require('./roundResultService');
const { buildPublicScoreboard } = require('./scoreboardService');

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
        lobbyId: member.lobbyId || null,
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        attempts: typeof member.attempts === 'number' ? member.attempts : 0,
        finished: Boolean(member.finished),
        timedOut: Boolean(member.timedOut),
        ready: member.role === 'player' && member.ready === true
    };

    if (options.includeGuesses) {
        serialized.guesses = Array.isArray(member.guesses) ? member.guesses.map(serializeGuessEntry) : [];
    }

    return serialized;
}

function serializeRoomMemberSummary(member, options = {}) {
    return {
        lobbyId: member.lobbyId || null,
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        isYou: Boolean(options.isYou),
        attempts: typeof member.attempts === 'number' ? member.attempts : 0,
        finished: Boolean(member.finished),
        timedOut: Boolean(member.timedOut),
        connected: member.connected !== false,
        ready: member.role === 'player' && member.ready === true
    };
}

function buildLiveBoardState(room) {
    return {
        roundState: room.roundState,
        roundResult: buildPublicRoundResult(room.roundResult),
        scoreboard: buildPublicScoreboard(room),
        isDailyChallenge: Boolean(room.isDailyChallenge),
        dailyDate: room.dailyDate || null,
        players: Object.values(room.players || {}).map(member => serializeRoomMember(member, { includeGuesses: true }))
    };
}

function buildPublicLobbySettings(room) {
    return {
        difficulty: room.lobbyDifficulty || room.difficulty || 'easy',
        timed: room.lobbyTimed === true,
        timeLimitSeconds: room.lobbyTimeLimitSeconds || room.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS
    };
}

function buildPublicRoomState(room, options = {}) {
    const recipientSocketId = options.recipientSocketId || null;
    const players = Object.values(room.players || {}).map(member => serializeRoomMemberSummary(member, {
        isYou: Boolean(recipientSocketId && member.socketId === recipientSocketId)
    }));
    const spectators = Object.values(room.spectators || {}).map(member => serializeRoomMemberSummary(member, {
        isYou: Boolean(recipientSocketId && member.socketId === recipientSocketId)
    }));

    return {
        roomId: room.roomId || null,
        playerCount: players.length,
        spectatorCount: spectators.length,
        totalCount: players.length + spectators.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        roundState: room.roundState,
        roundResult: buildPublicRoundResult(room.roundResult),
        scoreboard: buildPublicScoreboard(room),
        difficulty: room.difficulty || null,
        timed: Boolean(room.timed),
        timeLimitSeconds: room.timeLimitSeconds || null,
        lobbySettings: buildPublicLobbySettings(room),
        roundStartedAt: room.roundStartedAt || null,
        you: recipientSocketId ? serializeRoomMemberSummary((room.players || {})[recipientSocketId] || (room.spectators || {})[recipientSocketId] || {}, { isYou: true }) : null,
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
    buildPublicLobbySettings,
    buildPublicRoomState
};
