const test = require('node:test');
const assert = require('node:assert/strict');

const { createGameService } = require('../server/game/gameService');
const {
    createRoom,
    addPlayerToRoom,
    updateDuelLobbySettings,
    getDuelLobbySettings,
    resetPlayersForNewRound,
    resolveRoundWinner,
    buildPublicRoomState
} = require('../server/rooms/roomService');
const {
    buildPublicDuelMatch,
    resetDuelMatch
} = require('../server/rooms/duelMatchService');
const {
    serializeRoom,
    deserializeRoom,
    ROOM_PERSISTENCE_VERSION
} = require('../server/rooms/roomPersistence');
const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');

function createDriversRepository() {
    return {
        getDriversByDifficulty() {
            return [{
                id: 'driver-one',
                name: 'Driver One',
                nat: 'British',
                team: ['Test Team'],
                age: 30,
                debut: 2015,
                wins: 4,
                difficulty: 'easy'
            }];
        }
    };
}

function finishRound(room, winnerSocketId = null) {
    const players = Object.values(room.players);
    for (const player of players) {
        player.finished = true;
        player.attempts = player.socketId === winnerSocketId ? 1 : 6;
        player.correctGuess = player.socketId === winnerSocketId;
        player.completedAt = player.socketId === winnerSocketId ? 100 : 200;
    }
    return resolveRoundWinner(room, winnerSocketId ? 'correct-guess' : 'guess');
}

function createMatchRoom(bestOf = 3) {
    const room = createRoom('SERIES1', 'host', { id: 1, username: 'Host' });
    addPlayerToRoom(room, 'guest', { id: 2, username: 'Guest' });
    updateDuelLobbySettings(room, {
        difficulty: 'easy',
        timed: false,
        timeLimitSeconds: 60,
        bestOf
    });
    return room;
}

test('Best of 3 ends when one player reaches two round wins', () => {
    const room = createMatchRoom(3);
    const gameService = createGameService(createDriversRepository());
    const settings = getDuelLobbySettings(room);

    assert.ok(gameService.startNewRound(room, settings));
    const firstResult = finishRound(room, 'host');
    assert.equal(firstResult.match.status, 'active');
    assert.equal(firstResult.match.roundsPlayed, 1);
    assert.equal(room.scoreboard['user:1'].wins, 1);

    resetPlayersForNewRound(room);
    assert.ok(gameService.restartRound(room, settings));
    const secondResult = finishRound(room, 'host');

    assert.equal(secondResult.match.status, 'finished');
    assert.equal(secondResult.match.winnerUsername, 'Host');
    assert.equal(secondResult.match.roundsPlayed, 2);
    assert.equal(room.scoreboard['user:1'].wins, 2);
    assert.equal(gameService.restartRound(room, settings), null);
});

test('draws extend a Best of series without incrementing either score', () => {
    const room = createMatchRoom(5);
    const gameService = createGameService(createDriversRepository());

    assert.ok(gameService.startNewRound(room, getDuelLobbySettings(room)));
    const result = finishRound(room, null);
    const match = buildPublicDuelMatch(room);

    assert.equal(result.status, 'draw');
    assert.equal(match.bestOf, 5);
    assert.equal(match.winsRequired, 3);
    assert.equal(match.status, 'active');
    assert.equal(match.roundsPlayed, 1);
    assert.equal(match.draws, 1);
    assert.equal(room.scoreboard['user:1'].wins, 0);
    assert.equal(room.scoreboard['user:2'].wins, 0);
});

test('changing Best of format resets the current match and scoreboard', () => {
    const room = createMatchRoom(3);
    room.scoreboard['user:1'].wins = 1;
    room.matchState.status = 'active';
    room.matchState.roundsPlayed = 1;

    const result = updateDuelLobbySettings(room, {
        difficulty: 'medium',
        timed: true,
        timeLimitSeconds: 90,
        bestOf: 7
    });

    assert.equal(result.changed, true);
    assert.equal(result.matchReset, true);
    assert.equal(room.lobbyBestOf, 7);
    assert.deepEqual(room.scoreboard, {});
    assert.deepEqual(buildPublicDuelMatch(room), {
        bestOf: 7,
        winsRequired: 4,
        status: 'waiting',
        roundsPlayed: 0,
        draws: 0,
        winnerUsername: null,
        startedAt: null,
        finishedAt: null
    });
});

test('public and persisted room state include only safe Best of match data', () => {
    const room = createMatchRoom(5);
    room.matchState.status = 'finished';
    room.matchState.roundsPlayed = 4;
    room.matchState.draws = 1;
    room.matchState.winnerUsername = 'Host';
    room.matchState.startedAt = 100;
    room.matchState.finishedAt = 200;

    const publicState = buildPublicRoomState(room, { recipientSocketId: 'host' });
    assert.equal(publicState.lobbySettings.bestOf, 5);
    assert.equal(publicState.match.winnerUsername, 'Host');
    assert.equal(JSON.stringify(publicState).includes('scoreKey'), false);

    const serialized = serializeRoom(room);
    assert.equal(ROOM_PERSISTENCE_VERSION, 4);
    assert.equal(serialized.lobbyBestOf, 5);
    assert.equal(serialized.matchState.status, 'finished');
    const restored = deserializeRoom(serialized);
    assert.equal(restored.matchState.winnerUsername, 'Host');
    assert.equal(restored.matchState.winsRequired, 3);
});

function createFakeSocket(id, user) {
    const handlers = new Map();
    const emitted = [];
    const joinedRooms = new Set();
    return {
        id,
        user,
        data: {},
        handshake: { headers: { cookie: '' } },
        joinedRooms,
        on(name, handler) { handlers.set(name, handler); },
        emit(name, payload) { emitted.push({ name, payload }); },
        async join(roomId) { joinedRooms.add(roomId); },
        async leave(roomId) { joinedRooms.delete(roomId); },
        async trigger(name, payload) {
            const handler = handlers.get(name);
            assert.ok(handler, `Missing handler ${name}`);
            return handler(payload);
        },
        emitted(name) { return emitted.filter(event => event.name === name); },
        clear() { emitted.length = 0; }
    };
}

function createFakeIo() {
    const sockets = new Map();
    let connectionHandler = null;
    const matching = target => sockets.has(target)
        ? [sockets.get(target)]
        : [...sockets.values()].filter(socket => socket.joinedRooms.has(target));
    return {
        sockets: { sockets },
        use() {},
        on(name, handler) { if (name === 'connection') connectionHandler = handler; },
        connect(socket) { sockets.set(socket.id, socket); connectionHandler(socket); },
        in(target) { return { async fetchSockets() { return matching(target); } }; },
        to(target) { return { emit(name, payload) { matching(target).forEach(socket => socket.emit(name, payload)); } }; },
        emit(name, payload) { sockets.forEach(socket => socket.emit(name, payload)); }
    };
}

function createRoomStore() {
    const rooms = new Map();
    return {
        has: roomId => rooms.has(roomId),
        get: roomId => rooms.get(roomId) || null,
        set(roomId, room) { rooms.set(roomId, room); return room; },
        remove: roomId => rooms.delete(roomId),
        values: () => [...rooms.values()],
        markDirty() {},
        rooms
    };
}

test('only the host can reset a finished match and start is blocked before reset', async () => {
    const io = createFakeIo();
    const roomStore = createRoomStore();
    const gameService = createGameService(createDriversRepository());
    registerSocketHandlers(io, {
        roomStore,
        gameService,
        sessionService: null,
        socketRateLimit: { enabled: false }
    });

    const host = createFakeSocket('host', { id: 1, username: 'Host' });
    const guest = createFakeSocket('guest', { id: 2, username: 'Guest' });
    io.connect(host);
    io.connect(guest);
    await host.trigger('joinRoom', { roomId: 'SERIES2', clientId: 'host-client' });
    await guest.trigger('joinRoom', { roomId: 'SERIES2', clientId: 'guest-client' });

    const room = roomStore.get('SERIES2');
    await host.trigger('resetDuelMatch');
    assert.match(host.emitted('errorMessage').at(-1).payload, /nu s-a încheiat/i);

    room.scoreboard['user:1'].wins = 2;
    room.matchState.status = 'finished';
    room.matchState.roundsPlayed = 2;
    room.matchState.winnerUsername = 'Host';
    room.matchState.finishedAt = Date.now();
    host.clear();
    guest.clear();

    await host.trigger('setDifficulty', { level: 'easy', timed: false, timeLimitSeconds: 60 });
    assert.match(host.emitted('errorMessage').at(-1).payload, /meci nou/i);
    assert.equal(host.emitted('initGame').length, 0);

    await guest.trigger('resetDuelMatch');
    assert.match(guest.emitted('errorMessage').at(-1).payload, /Doar hostul/);
    assert.equal(room.matchState.status, 'finished');

    await host.trigger('resetDuelMatch');
    assert.equal(room.matchState.status, 'waiting');
    assert.equal(room.matchState.roundsPlayed, 0);
    assert.equal(room.scoreboard['user:1'].wins, 0);
    assert.equal(room.scoreboard['user:2'].wins, 0);
    assert.equal(host.emitted('roomStateUpdate').at(-1).payload.reason, 'match-reset');
});
