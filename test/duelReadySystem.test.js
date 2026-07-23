const test = require('node:test');
const assert = require('node:assert/strict');

const { createGameService } = require('../server/game/gameService');
const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');

function createFakeSocket(id, user = null) {
    const handlers = new Map();
    const emitted = [];
    const joinedRooms = new Set();

    return {
        id,
        user,
        data: {},
        handshake: { headers: { cookie: '' } },
        joinedRooms,
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        async join(roomId) {
            joinedRooms.add(roomId);
        },
        async leave(roomId) {
            joinedRooms.delete(roomId);
        },
        async trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected socket handler for ${eventName}`);
            return handler(payload);
        },
        emitted(eventName) {
            return emitted.filter(event => event.eventName === eventName);
        },
        clearEmitted() {
            emitted.length = 0;
        }
    };
}

function createFakeIo() {
    const sockets = new Map();
    let connectionHandler = null;

    function matchingSockets(target) {
        if (sockets.has(target)) return [sockets.get(target)];
        return [...sockets.values()].filter(socket => socket.joinedRooms.has(target));
    }

    return {
        sockets: { sockets },
        use() {},
        on(eventName, handler) {
            if (eventName === 'connection') connectionHandler = handler;
        },
        connect(socket) {
            sockets.set(socket.id, socket);
            connectionHandler(socket);
        },
        in(target) {
            return {
                async fetchSockets() {
                    return matchingSockets(target);
                }
            };
        },
        to(target) {
            return {
                emit(eventName, payload) {
                    for (const socket of matchingSockets(target)) socket.emit(eventName, payload);
                }
            };
        },
        emit(eventName, payload) {
            for (const socket of sockets.values()) socket.emit(eventName, payload);
        }
    };
}

function createRoomStore() {
    const rooms = new Map();
    return {
        has(roomId) { return rooms.has(roomId); },
        get(roomId) { return rooms.get(roomId) || null; },
        set(roomId, room) { rooms.set(roomId, room); return room; },
        remove(roomId) { return rooms.delete(roomId); },
        values() { return [...rooms.values()]; },
        markDirty() {},
        rooms
    };
}

function createTestContext() {
    const roomStore = createRoomStore();
    const io = createFakeIo();
    const drivers = [{
        id: 'driver-one',
        name: 'Driver One',
        nat: 'British',
        team: ['Test Team'],
        age: 30,
        debut: 2015,
        wins: 4,
        difficulty: 'easy'
    }];
    const gameService = createGameService({
        getDriversByDifficulty() {
            return drivers;
        }
    });

    registerSocketHandlers(io, {
        roomStore,
        gameService,
        sessionService: null,
        socketRateLimit: { enabled: false }
    });

    const host = createFakeSocket('socket-host', { id: 1, username: 'Host' });
    const player = createFakeSocket('socket-player', { id: 2, username: 'Player' });
    io.connect(host);
    io.connect(player);

    return { io, roomStore, host, player };
}

async function joinReadyRoom(context) {
    await context.host.trigger('joinRoom', { roomId: 'READY01', clientId: 'host-client' });
    await context.player.trigger('joinRoom', { roomId: 'READY01', clientId: 'player-client' });
    context.host.clearEmitted();
    context.player.clearEmitted();
    return context.roomStore.get('READY01');
}

test('Duel round start is blocked until both players confirm Ready', async () => {
    const context = createTestContext();
    const room = await joinReadyRoom(context);

    await context.host.trigger('setDifficulty', {
        level: 'easy',
        timed: false,
        timeLimitSeconds: 60
    });

    assert.equal(context.host.emitted('initGame').length, 0);
    assert.match(context.host.emitted('errorMessage').at(-1).payload, /Ambii jucători conectați/);

    context.host.clearEmitted();
    await context.host.trigger('setDuelReady', { ready: true });
    await context.player.trigger('setDuelReady', { ready: true });

    assert.equal(room.players['socket-host'].ready, true);
    assert.equal(room.players['socket-player'].ready, true);
    const hostState = context.host.emitted('roomStateUpdate').at(-1).payload.room;
    assert.equal(hostState.you.ready, true);
    assert.equal(hostState.players.every(member => member.ready), true);

    context.host.clearEmitted();
    context.player.clearEmitted();
    await context.host.trigger('setDifficulty', {
        level: 'easy',
        timed: false,
        timeLimitSeconds: 60
    });

    assert.equal(context.host.emitted('initGame').length, 1);
    assert.equal(context.player.emitted('initGame').length, 1);
    assert.equal(room.roundState, 'playing');
    assert.equal(room.players['socket-host'].ready, false);
    assert.equal(room.players['socket-player'].ready, false);
});

test('changing Duel lobby settings resets both Ready confirmations', async () => {
    const context = createTestContext();
    const room = await joinReadyRoom(context);

    await context.host.trigger('setDuelReady', { ready: true });
    await context.player.trigger('setDuelReady', { ready: true });
    assert.equal(Object.values(room.players).every(member => member.ready), true);

    await context.host.trigger('updateDuelLobbySettings', {
        level: 'medium',
        timed: true,
        timeLimitSeconds: 90
    });

    assert.equal(room.lobbyDifficulty, 'medium');
    assert.equal(room.lobbyTimed, true);
    assert.equal(room.lobbyTimeLimitSeconds, 90);
    assert.equal(Object.values(room.players).every(member => member.ready === false), true);
    assert.equal(context.host.emitted('roomStateUpdate').at(-1).payload.reason, 'lobby-settings-updated');
});
