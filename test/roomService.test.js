const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    removeInactiveRoomMembers,
    refreshRoomMemberAuth,
    getPlayer,
    getSpectator,
    getPlayerCount,
    getSpectatorCount,
    isHost,
    isSpectator,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState,
    buildPublicRoomState
} = require('../server/rooms/roomService');

test('room creation creates host as first player', () => {
    const room = createRoom('abc123', 'socket-host');

    assert.equal(room.roomId, 'abc123');
    assert.equal(getPlayerCount(room), 1);
    assert.equal(getSpectatorCount(room), 0);
    assert.equal(isHost(room, 'socket-host'), true);
    assert.equal(getPlayer(room, 'socket-host').username, 'Guest 1');
});

test('third member joins as spectator, not player', () => {
    const room = createRoom('abc123', 'socket-1');

    assert.deepEqual(addPlayerToRoom(room, 'socket-2'), { joined: true, role: 'player' });
    assert.deepEqual(addPlayerToRoom(room, 'socket-3'), { joined: true, role: 'spectator' });

    assert.equal(getPlayerCount(room), 2);
    assert.equal(getSpectatorCount(room), 1);
    assert.equal(isSpectator(room, 'socket-3'), true);
    assert.equal(getSpectator(room, 'socket-3').username, 'Guest 3');
});

test('spectator is promoted when an active player leaves', () => {
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    addPlayerToRoom(room, 'socket-3');

    removePlayerFromRoom(room, 'socket-2');

    assert.equal(getPlayerCount(room), 2);
    assert.equal(getSpectatorCount(room), 0);
    assert.equal(Boolean(getPlayer(room, 'socket-3')), true);
    assert.equal(getPlayer(room, 'socket-3').role, 'player');
});

test('host transfers when host leaves', () => {
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');

    removePlayerFromRoom(room, 'socket-1');

    assert.equal(isHost(room, 'socket-2'), true);
    assert.equal(getPlayer(room, 'socket-2').isHost, true);
});

test('inactive members are removed and active spectator can be promoted', () => {
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    addPlayerToRoom(room, 'socket-3');

    const changed = removeInactiveRoomMembers(room, socketId => socketId !== 'socket-2');

    assert.equal(changed, true);
    assert.equal(getPlayerCount(room), 2);
    assert.equal(getSpectatorCount(room), 0);
    assert.equal(Boolean(getPlayer(room, 'socket-3')), true);
});

test('auth refresh updates username and logout returns to guest username', () => {
    const room = createRoom('abc123', 'socket-1');

    refreshRoomMemberAuth(room, 'socket-1', { id: 'user-1', username: 'Narcis' });
    assert.equal(getPlayer(room, 'socket-1').username, 'Narcis');

    refreshRoomMemberAuth(room, 'socket-1', null);
    assert.equal(getPlayer(room, 'socket-1').username, 'Guest 1');
});

test('resetPlayersForNewRound clears attempts, finished state and guesses', () => {
    const room = createRoom('abc123', 'socket-1');
    const player = getPlayer(room, 'socket-1');

    player.attempts = 3;
    player.finished = true;
    player.timedOut = true;
    player.guesses = [{ attempt: 1 }];

    resetPlayersForNewRound(room);

    assert.equal(player.attempts, 0);
    assert.equal(player.finished, false);
    assert.equal(player.timedOut, false);
    assert.deepEqual(player.guesses, []);
});

test('recordPlayerGuess stores public live board data without internal fields', () => {
    const room = createRoom('abc123', 'socket-1');
    const player = getPlayer(room, 'socket-1');
    player.attempts = 1;

    recordPlayerGuess(
        player,
        { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', team: ['Mercedes'], age: 39, debut: 2007, wins: 103 },
        { name: 'green' },
        true,
        true
    );

    const liveBoard = buildLiveBoardState(room);
    const guess = liveBoard.players[0].guesses[0];

    assert.equal(guess.attempt, 1);
    assert.equal(guess.guess.name, 'Lewis Hamilton');
    assert.equal(guess.guess.id, undefined);
    assert.equal(guess.createdAt, undefined);
});

test('timed out player is marked and exposed in live board', () => {
    const room = createRoom('abc123', 'socket-1');
    const player = getPlayer(room, 'socket-1');

    markPlayerTimedOut(player);

    const liveBoard = buildLiveBoardState(room);
    assert.equal(liveBoard.players[0].finished, true);
    assert.equal(liveBoard.players[0].timedOut, true);
});

test('public room state does not expose socketId or userId', () => {
    const room = createRoom('abc123', 'socket-1', { id: 'user-1', username: 'Narcis' });
    addPlayerToRoom(room, 'socket-2');
    addPlayerToRoom(room, 'socket-3');

    const publicState = buildPublicRoomState(room);
    const firstPlayer = publicState.players[0];
    const firstSpectator = publicState.spectators[0];

    assert.equal(firstPlayer.username, 'Narcis');
    assert.equal(firstPlayer.socketId, undefined);
    assert.equal(firstPlayer.userId, undefined);
    assert.equal(firstSpectator.socketId, undefined);
    assert.equal(firstSpectator.userId, undefined);
});

test('duel round resolves with the first correct player as winner', () => {
    const {
        resolveRoundWinner,
        buildPublicRoundResult,
        buildPersonalRoundResult
    } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const winner = getPlayer(room, 'socket-1');
    winner.attempts = 2;
    recordPlayerGuess(
        winner,
        { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', team: ['Mercedes'], age: 39, debut: 2007, wins: 103 },
        { name: 'green' },
        true,
        true
    );

    const result = resolveRoundWinner(room, 'correct-guess');
    const publicResult = buildPublicRoundResult(result);
    const winnerResult = buildPersonalRoundResult(result, winner);
    const loserResult = buildPersonalRoundResult(result, getPlayer(room, 'socket-2'));

    assert.equal(room.roundState, 'playing');
    assert.equal(result.status, 'win');
    assert.equal(result.allPlayersFinished, false);
    assert.equal(publicResult.winnerUsername, 'Guest 1');
    assert.equal(publicResult.winnerSocketId, undefined);
    assert.equal(winnerResult.resultForYou.outcome, 'win');
    assert.equal(loserResult.resultForYou.outcome, 'pending');

    const loser = getPlayer(room, 'socket-2');
    loser.attempts = 6;
    loser.finished = true;
    loser.correctGuess = false;
    loser.completedAt = Date.now();

    const finalResult = resolveRoundWinner(room, 'guess');
    const finalLoserResult = buildPersonalRoundResult(finalResult, loser);

    assert.equal(room.roundState, 'finished');
    assert.equal(finalResult.allPlayersFinished, true);
    assert.equal(finalLoserResult.resultForYou.outcome, 'loss');
});


test('duel round returns win outcome when non-host player guesses first', () => {
    const {
        resolveRoundWinner,
        buildPersonalRoundResult
    } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-host');
    addPlayerToRoom(room, 'socket-guest');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const nonHost = getPlayer(room, 'socket-guest');
    nonHost.attempts = 1;
    recordPlayerGuess(
        nonHost,
        { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', team: ['Mercedes'], age: 39, debut: 2007, wins: 103 },
        { name: 'green' },
        true,
        true
    );

    const result = resolveRoundWinner(room, 'correct-guess');
    const nonHostResult = buildPersonalRoundResult(result, nonHost);
    const hostResult = buildPersonalRoundResult(result, getPlayer(room, 'socket-host'));

    assert.equal(result.status, 'win');
    assert.equal(result.winnerUsername, nonHost.username);
    assert.equal(nonHost.isHost, false);
    assert.equal(nonHostResult.resultForYou.outcome, 'win');
    assert.equal(nonHostResult.resultForYou.isWinner, true);
    assert.equal(hostResult.resultForYou.outcome, 'pending');
    assert.equal(room.roundState, 'playing');
});

test('duel round resolves as draw when all players finish without a correct guess', () => {
    const { resolveRoundWinner, buildPersonalRoundResult } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    for (const player of Object.values(room.players)) {
        player.attempts = 6;
        player.finished = true;
        player.correctGuess = false;
        player.completedAt = Date.now();
    }

    const result = resolveRoundWinner(room, 'no-correct-guess');

    assert.equal(result.status, 'draw');
    assert.equal(result.winnerUsername, null);
    assert.equal(buildPersonalRoundResult(result, getPlayer(room, 'socket-1')).resultForYou.outcome, 'draw');
    assert.equal(buildPersonalRoundResult(result, getPlayer(room, 'socket-2')).resultForYou.outcome, 'draw');
});

