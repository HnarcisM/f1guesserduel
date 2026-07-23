const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    removeInactiveRoomMembers,
    markRoomMemberDisconnectedBySocketId,
    selectSpectatorAsPlayer,
    refreshRoomMemberAuth,
    resetDuelReadyState,
    areDuelPlayersReady,
    getDuelReadyStatus,
    setDuelPlayerReady,
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
    buildPublicRoomState,
    abortDuelRound
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


test('host can select a spectator as player two and the score resets', () => {
    const room = createRoom('abc123', 'socket-host');
    addPlayerToRoom(room, 'socket-player');
    addPlayerToRoom(room, 'socket-spectator');

    room.scoreboard[getPlayer(room, 'socket-host').scoreKey].wins = 3;
    room.scoreboard[getPlayer(room, 'socket-player').scoreKey].wins = 2;

    const selectedSpectator = getSpectator(room, 'socket-spectator');
    const result = selectSpectatorAsPlayer(room, selectedSpectator.lobbyId);

    assert.equal(result.changed, true);
    assert.equal(getPlayerCount(room), 2);
    assert.equal(getSpectatorCount(room), 1);
    assert.equal(isHost(room, 'socket-host'), true);
    assert.equal(Boolean(getPlayer(room, 'socket-spectator')), true);
    assert.equal(getPlayer(room, 'socket-spectator').role, 'player');
    assert.equal(Boolean(getSpectator(room, 'socket-player')), true);
    assert.equal(getSpectator(room, 'socket-player').role, 'spectator');

    const publicScoreboard = room.scoreboard;
    for (const entry of Object.values(publicScoreboard)) {
        assert.equal(entry.wins, 0);
    }
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



test('refresh reconnects the same browser participant and preserves duel progress', () => {
    const room = createRoom('abc123', 'socket-1', null, { clientId: 'tab-one' });
    const player = getPlayer(room, 'socket-1');
    player.attempts = 2;
    player.finished = false;
    player.guesses = [{ attempt: 1 }, { attempt: 2 }];
    room.roundState = 'playing';
    room.hostId = 'socket-1';

    markRoomMemberDisconnectedBySocketId(room, 'socket-1');
    assert.equal(getPlayer(room, 'socket-1').connected, false);

    const reconnectEvents = [];
    const result = addPlayerToRoom(room, 'socket-1-refresh', null, {
        clientId: 'tab-one',
        onReconnect: event => reconnectEvents.push(event)
    });
    const reconnectedPlayer = getPlayer(room, 'socket-1-refresh');

    assert.deepEqual(result, { joined: true, role: 'player', reconnected: true });
    assert.equal(getPlayer(room, 'socket-1'), null);
    assert.equal(reconnectedPlayer.attempts, 2);
    assert.equal(reconnectedPlayer.finished, false);
    assert.equal(reconnectedPlayer.guesses.length, 2);
    assert.equal(reconnectedPlayer.connected, true);
    assert.equal(room.hostId, 'socket-1-refresh');
    assert.equal(isHost(room, 'socket-1-refresh'), true);
    assert.equal(reconnectEvents.length, 1);
    assert.equal(reconnectEvents[0].role, 'player');
    assert.ok(reconnectEvents[0].durationMs >= 0);
});

test('inactive participant with reconnect key is kept during cleanup grace period', () => {
    const room = createRoom('abc123', 'socket-1', null, { clientId: 'tab-one' });
    addPlayerToRoom(room, 'socket-2', null, { clientId: 'tab-two' });
    room.roundState = 'playing';

    const changed = removeInactiveRoomMembers(room, socketId => socketId !== 'socket-1');

    assert.equal(changed, true);
    assert.equal(getPlayerCount(room), 2);
    assert.equal(getPlayer(room, 'socket-1').connected, false);
    assert.equal(getPlayer(room, 'socket-1').attempts, 0);
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
    assert.equal(typeof firstPlayer.lobbyId, 'string');
    assert.equal(firstSpectator.socketId, undefined);
    assert.equal(firstSpectator.userId, undefined);
    assert.equal(typeof firstSpectator.lobbyId, 'string');
});


test('duel round waits for all players then uses fewer attempts as winner', () => {
    const {
        resolveRoundWinner,
        buildPublicRoundResult,
        buildPersonalRoundResult
    } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const playerOne = getPlayer(room, 'socket-1');
    playerOne.attempts = 2;
    recordPlayerGuess(
        playerOne,
        { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', team: ['Mercedes'], age: 39, debut: 2007, wins: 103 },
        { name: 'green' },
        true,
        true
    );

    const partialResult = resolveRoundWinner(room, 'correct-guess');
    assert.equal(partialResult, null);
    assert.equal(room.roundState, 'playing');

    const playerTwo = getPlayer(room, 'socket-2');
    playerTwo.attempts = 6;
    playerTwo.finished = true;
    playerTwo.correctGuess = false;
    playerTwo.completedAt = Date.now();

    const result = resolveRoundWinner(room, 'guess');
    const publicResult = buildPublicRoundResult(result);
    const winnerResult = buildPersonalRoundResult(result, playerOne);
    const loserResult = buildPersonalRoundResult(result, playerTwo);

    assert.equal(room.roundState, 'finished');
    assert.equal(result.status, 'win');
    assert.equal(result.allPlayersFinished, true);
    assert.equal(publicResult.winnerUsername, 'Guest 1');
    assert.equal(publicResult.winnerSocketId, undefined);
    assert.equal(winnerResult.resultForYou.outcome, 'win');
    assert.equal(loserResult.resultForYou.outcome, 'loss');
});


test('duel round can be won by non-host after both players finish', () => {
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

    assert.equal(resolveRoundWinner(room, 'correct-guess'), null);

    const host = getPlayer(room, 'socket-host');
    host.attempts = 6;
    host.finished = true;
    host.correctGuess = false;
    host.completedAt = Date.now();

    const result = resolveRoundWinner(room, 'guess');
    const nonHostResult = buildPersonalRoundResult(result, nonHost);
    const hostResult = buildPersonalRoundResult(result, host);

    assert.equal(result.status, 'win');
    assert.equal(result.winnerUsername, nonHost.username);
    assert.equal(nonHost.isHost, false);
    assert.equal(nonHostResult.resultForYou.outcome, 'win');
    assert.equal(nonHostResult.resultForYou.isWinner, true);
    assert.equal(hostResult.resultForYou.outcome, 'loss');
    assert.equal(room.roundState, 'finished');
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


test('duel scoreboard increments only after all players finish and persists across rematch reset', () => {
    const {
        resolveRoundWinner,
        buildPublicScoreboard
    } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const winner = getPlayer(room, 'socket-1');
    winner.attempts = 1;
    recordPlayerGuess(
        winner,
        { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', team: ['Mercedes'], age: 39, debut: 2007, wins: 103 },
        { name: 'green' },
        true,
        true
    );

    const partialResult = resolveRoundWinner(room, 'correct-guess');
    assert.equal(partialResult, null);
    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [0, 0]);

    const loser = getPlayer(room, 'socket-2');
    loser.attempts = 6;
    loser.finished = true;
    loser.correctGuess = false;
    loser.completedAt = Date.now();

    const finalResult = resolveRoundWinner(room, 'guess');
    assert.equal(finalResult.allPlayersFinished, true);
    assert.equal(finalResult.scoreApplied, true);
    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [1, 0]);

    resetPlayersForNewRound(room);
    room.roundResult = null;
    room.roundState = 'playing';

    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [1, 0]);
});


test('duel winner is decided by fewer attempts before completion time', () => {
    const {
        resolveRoundWinner,
        buildPersonalRoundResult,
        buildPublicScoreboard
    } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const host = getPlayer(room, 'socket-1');
    const guest = getPlayer(room, 'socket-2');

    guest.attempts = 6;
    guest.finished = true;
    guest.correctGuess = true;
    guest.completedAt = 1000;

    host.attempts = 2;
    host.finished = true;
    host.correctGuess = true;
    host.completedAt = 2000;

    const result = resolveRoundWinner(room, 'correct-guess');
    const guestResult = buildPersonalRoundResult(result, guest);
    const hostResult = buildPersonalRoundResult(result, host);
    const score = buildPublicScoreboard(room);

    assert.equal(result.status, 'win');
    assert.equal(result.winnerUsername, host.username);
    assert.equal(hostResult.resultForYou.outcome, 'win');
    assert.equal(guestResult.resultForYou.outcome, 'loss');
    assert.deepEqual(score.map(entry => entry.wins), [1, 0]);
});

test('duel winner uses completion time when attempts are equal', () => {
    const { resolveRoundWinner } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    const host = getPlayer(room, 'socket-1');
    const guest = getPlayer(room, 'socket-2');

    host.attempts = 3;
    host.finished = true;
    host.correctGuess = true;
    host.completedAt = 2000;

    guest.attempts = 3;
    guest.finished = true;
    guest.correctGuess = true;
    guest.completedAt = 1000;

    const result = resolveRoundWinner(room, 'correct-guess');
    assert.equal(result.status, 'win');
    assert.equal(result.winnerUsername, guest.username);
});

test('duel round is draw when attempts and completion time are identical', () => {
    const { resolveRoundWinner, buildPublicScoreboard } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.targetDriver = { name: 'Lewis Hamilton' };

    for (const player of Object.values(room.players)) {
        player.attempts = 3;
        player.finished = true;
        player.correctGuess = true;
        player.completedAt = 1000;
    }

    const result = resolveRoundWinner(room, 'correct-guess');
    assert.equal(result.status, 'draw');
    assert.equal(result.winnerUsername, null);
    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [0, 0]);
});

test('duel scoreboard does not increment on draw', () => {
    const {
        resolveRoundWinner,
        buildPublicScoreboard
    } = require('../server/rooms/roomService');
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
    assert.equal(result.scoreApplied, true);
    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [0, 0]);
});


test('abortDuelRound stops active duel round without resetting scoreboard', () => {
    const { buildPublicScoreboard } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.difficulty = 'easy';
    room.targetDriver = { name: 'Lewis Hamilton' };
    room.driversList = [{ id: 'hamilton', name: 'Lewis Hamilton' }];
    room.scoreboard[getPlayer(room, 'socket-1').scoreKey].wins = 2;

    const player = getPlayer(room, 'socket-1');
    player.attempts = 2;
    player.finished = true;
    player.guesses = [{ attempt: 1 }];

    const result = abortDuelRound(room, 'player-aborted');

    assert.equal(result.status, 'aborted');
    assert.equal(room.roundState, 'waiting');
    assert.equal(room.targetDriver, null);
    assert.equal(room.roundStartedAt, null);
    assert.equal(getPlayer(room, 'socket-1').attempts, 0);
    assert.equal(getPlayer(room, 'socket-1').finished, false);
    assert.deepEqual(getPlayer(room, 'socket-1').guesses, []);
    assert.deepEqual(buildPublicScoreboard(room).map(entry => entry.wins), [2, 0]);
});

test('public room state exposes opponent progress without guesses for finished player waiting', () => {
    const { buildPublicRoomState } = require('../server/rooms/roomService');
    const room = createRoom('abc123', 'socket-1');
    addPlayerToRoom(room, 'socket-2');
    room.roundState = 'playing';
    room.timed = true;
    room.timeLimitSeconds = 90;
    room.roundStartedAt = 123456;

    const host = getPlayer(room, 'socket-1');
    const guest = getPlayer(room, 'socket-2');
    host.attempts = 4;
    host.finished = true;
    host.guesses = [{ attempt: 1, guess: { name: 'Hidden' } }];
    guest.attempts = 2;
    guest.finished = false;
    guest.guesses = [{ attempt: 1, guess: { name: 'Also Hidden' } }];

    const state = buildPublicRoomState(room, { recipientSocketId: 'socket-1' });

    assert.equal(state.you.username, host.username);
    assert.equal(state.you.finished, true);
    assert.equal(state.timed, true);
    assert.equal(state.timeLimitSeconds, 90);
    assert.equal(state.roundStartedAt, 123456);
    assert.equal(state.players[0].isYou, true);
    assert.equal(state.players[0].attempts, 4);
    assert.equal(state.players[1].isYou, false);
    assert.equal(state.players[1].attempts, 2);
    assert.equal(state.players[1].finished, false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.players[1], 'guesses'), false);
});


test('both connected Duel players must confirm Ready before start', () => {
    const room = createRoom('ready-room', 'socket-host');
    addPlayerToRoom(room, 'socket-player');

    assert.equal(areDuelPlayersReady(room), false);
    assert.deepEqual(getDuelReadyStatus(room), {
        playerCount: 2,
        connectedPlayerCount: 2,
        readyPlayerCount: 0,
        allReady: false
    });

    const hostReady = setDuelPlayerReady(room, 'socket-host', true);
    assert.equal(hostReady.changed, true);
    assert.equal(hostReady.allReady, false);

    const playerReady = setDuelPlayerReady(room, 'socket-player', true);
    assert.equal(playerReady.changed, true);
    assert.equal(playerReady.allReady, true);
    assert.equal(areDuelPlayersReady(room), true);
    assert.equal(buildPublicRoomState(room, { recipientSocketId: 'socket-host' }).you.ready, true);
});

test('Ready confirmations reset when settings or active players change', () => {
    const room = createRoom('ready-room', 'socket-host');
    addPlayerToRoom(room, 'socket-player');
    setDuelPlayerReady(room, 'socket-host', true);
    setDuelPlayerReady(room, 'socket-player', true);

    assert.equal(resetDuelReadyState(room), true);
    assert.equal(getPlayer(room, 'socket-host').ready, false);
    assert.equal(getPlayer(room, 'socket-player').ready, false);

    setDuelPlayerReady(room, 'socket-host', true);
    setDuelPlayerReady(room, 'socket-player', true);
    addPlayerToRoom(room, 'socket-spectator');
    const selected = selectSpectatorAsPlayer(room, getSpectator(room, 'socket-spectator').lobbyId);

    assert.equal(selected.changed, true);
    assert.equal(areDuelPlayersReady(room), false);
    assert.equal(Object.values(room.players).every(player => player.ready === false), true);
});

test('disconnecting an active player resets Ready for the whole lobby', () => {
    const room = createRoom('ready-room', 'socket-host', null, { clientId: 'host-client' });
    addPlayerToRoom(room, 'socket-player', null, { clientId: 'player-client' });
    setDuelPlayerReady(room, 'socket-host', true);
    setDuelPlayerReady(room, 'socket-player', true);

    markRoomMemberDisconnectedBySocketId(room, 'socket-player');

    assert.equal(getPlayer(room, 'socket-player').connected, false);
    assert.equal(getPlayer(room, 'socket-host').ready, false);
    assert.equal(getPlayer(room, 'socket-player').ready, false);
    assert.equal(areDuelPlayersReady(room), false);
});
