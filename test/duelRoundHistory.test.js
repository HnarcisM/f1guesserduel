const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createRoom,
    addPlayerToRoom,
    buildPublicRoomState,
    recordPlayerGuess,
    resetDuelMatch,
    resetPlayersForNewRound,
    resolveRoundWinner
} = require('../server/rooms/roomService');
const {
    MAX_DUEL_ROUND_HISTORY,
    buildPublicRoundHistory,
    normalizeRoundHistory
} = require('../server/rooms/roundHistoryService');
const {
    ROOM_PERSISTENCE_VERSION,
    deserializeRoom,
    serializeRoom
} = require('../server/rooms/roomPersistence');

const targetDriver = {
    id: 'VER',
    name: 'Max Verstappen',
    nat: 'NED',
    team: ['Red Bull'],
    age: 28,
    debut: 2015,
    wins: 68
};
const wrongDriver = {
    id: 'NOR',
    name: 'Lando Norris',
    nat: 'GBR',
    team: ['McLaren'],
    age: 26,
    debut: 2019,
    wins: 10
};

function createHistoryRoom() {
    const room = createRoom('HISTORY1', 'host', { id: 1, username: 'Host' });
    addPlayerToRoom(room, 'guest', { id: 2, username: 'Guest' });
    room.difficulty = 'hard';
    room.timed = true;
    room.timeLimitSeconds = 90;
    return room;
}

function startRound(room, startedAt = Date.now() - 1_000) {
    resetPlayersForNewRound(room);
    room.targetDriver = { ...targetDriver };
    room.driversList = [{ ...targetDriver }, { ...wrongDriver }];
    room.roundStartedAt = startedAt;
    room.roundState = 'playing';
    room.roundResult = null;
}

function finishWinningRound(room) {
    startRound(room);
    const host = room.players.host;
    const guest = room.players.guest;

    host.attempts = 1;
    host.finished = true;
    host.correctGuess = true;
    host.completedAt = Date.now() - 100;
    recordPlayerGuess(host, targetDriver, { name: 'correct' }, true, true);

    guest.attempts = 2;
    guest.finished = true;
    guest.correctGuess = false;
    guest.completedAt = Date.now();
    recordPlayerGuess(guest, wrongDriver, { name: 'wrong' }, false, true);

    return resolveRoundWinner(room, 'guess');
}

function finishDrawRound(room, startedAt) {
    startRound(room, startedAt);
    for (const player of Object.values(room.players)) {
        player.attempts = 6;
        player.finished = true;
        player.correctGuess = false;
        player.completedAt = startedAt + 500;
        recordPlayerGuess(player, wrongDriver, { name: 'wrong' }, false, true);
    }
    return resolveRoundWinner(room, 'guess');
}

test('completed Duel rounds create replay-ready public history without internal identifiers', () => {
    const room = createHistoryRoom();
    const result = finishWinningRound(room);
    const history = buildPublicRoundHistory(room);

    assert.equal(result.historyApplied, true);
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'win');
    assert.equal(history[0].winnerUsername, 'Host');
    assert.equal(history[0].target.id, 'VER');
    assert.equal(history[0].target.name, 'Max Verstappen');
    assert.equal(history[0].difficulty, 'hard');
    assert.equal(history[0].timed, true);
    assert.equal(history[0].timeLimitSeconds, 90);
    assert.deepEqual(history[0].scoreboard, [
        { username: 'Host', wins: 1 },
        { username: 'Guest', wins: 0 }
    ]);
    assert.equal(history[0].players[0].guesses[0].guess.name, 'Max Verstappen');
    assert.deepEqual(history[0].players[0].guesses[0].results, { name: 'correct' });
    assert.equal(JSON.stringify(history).includes('socketId'), false);
    assert.equal(JSON.stringify(history).includes('userId'), false);
    assert.equal(JSON.stringify(history).includes('scoreKey'), false);

    const publicRoom = buildPublicRoomState(room, { recipientSocketId: 'host' });
    assert.deepEqual(publicRoom.roundHistory, history);
});

test('round history keeps only the latest ten rounds in newest-first public order', () => {
    const room = createHistoryRoom();
    const baseTime = Date.now() - 20_000;

    for (let index = 0; index < MAX_DUEL_ROUND_HISTORY + 1; index += 1) {
        finishDrawRound(room, baseTime + index * 1_000);
    }

    const publicHistory = buildPublicRoundHistory(room);
    assert.equal(room.roundHistory.length, MAX_DUEL_ROUND_HISTORY);
    assert.equal(publicHistory.length, MAX_DUEL_ROUND_HISTORY);
    assert.equal(publicHistory[0].sequence, MAX_DUEL_ROUND_HISTORY + 1);
    assert.equal(publicHistory.at(-1).sequence, 2);
    assert.ok(publicHistory.every(entry => entry.status === 'draw'));
});



test('round history normalization bounds persisted collections before exposing them', () => {
    const oversizedHistory = Array.from({ length: 25 }, (_, historyIndex) => ({
        id: `oversized-${historyIndex}`,
        sequence: historyIndex + 1,
        status: 'draw',
        resolvedAt: historyIndex + 1,
        players: Array.from({ length: 5 }, (_, playerIndex) => ({
            username: `Player ${playerIndex}`,
            outcome: 'draw',
            guesses: Array.from({ length: 20 }, (_, guessIndex) => ({
                attempt: guessIndex + 1,
                guess: { name: `Driver ${guessIndex}` },
                results: Array.from({ length: 100 }, (_, resultIndex) => resultIndex)
            }))
        }))
    }));

    const normalized = normalizeRoundHistory(oversizedHistory);
    assert.equal(normalized.length, MAX_DUEL_ROUND_HISTORY);
    assert.equal(normalized[0].sequence, 16);
    assert.equal(normalized[0].players.length, 2);
    assert.equal(normalized[0].players[0].guesses.length, 6);
    assert.equal(normalized[0].players[0].guesses[0].results.length, 32);
});

test('starting a new Best of match preserves room history', () => {
    const room = createHistoryRoom();
    finishWinningRound(room);
    const historyBeforeReset = buildPublicRoundHistory(room);

    resetDuelMatch(room, { bestOf: 5 });

    assert.equal(room.matchState.bestOf, 5);
    assert.deepEqual(buildPublicRoundHistory(room), historyBeforeReset);
});

test('round history persists with version 4 and legacy rooms restore an empty history', () => {
    const room = createHistoryRoom();
    finishWinningRound(room);

    const serialized = serializeRoom(room);
    assert.equal(ROOM_PERSISTENCE_VERSION, 4);
    assert.equal(serialized.roundHistory.length, 1);
    const restored = deserializeRoom(serialized);
    assert.deepEqual(restored.roundHistory, serialized.roundHistory);

    const legacy = { ...serialized };
    delete legacy.roundHistory;
    const restoredLegacy = deserializeRoom(legacy);
    assert.deepEqual(restoredLegacy.roundHistory, []);
});
