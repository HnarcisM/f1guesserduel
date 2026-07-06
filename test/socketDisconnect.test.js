const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');

function createFakeIo() {
    return {
        middleware: null,
        connectionHandler: null,
        sockets: {
            sockets: new Map()
        },
        use(fn) {
            this.middleware = fn;
        },
        on(eventName, handler) {
            if (eventName === 'connection') this.connectionHandler = handler;
        },
        to() {
            return { emit() {} };
        },
        addSocket(socket) {
            this.sockets.sockets.set(socket.id, socket);
        }
    };
}

function createFakeSocket({ id, username }) {
    const handlers = new Map();
    const emitted = [];
    const joinedRooms = new Set();

    return {
        id,
        user: { id: `user-${id}`, username },
        handshake: { headers: { cookie: '' } },
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        join(roomId) {
            joinedRooms.add(roomId);
        },
        leave(roomId) {
            joinedRooms.delete(roomId);
        },
        trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected socket handler for ${eventName}`);
            return handler(payload);
        },
        emitted(eventName) {
            return emitted.filter(event => event.eventName === eventName);
        },
        clearEmitted() {
            emitted.length = 0;
        },
        hasJoined(roomId) {
            return joinedRooms.has(roomId);
        }
    };
}

function createRoomStore() {
    const rooms = new Map();
    let markDirtyCalls = 0;

    return {
        has(roomId) {
            return rooms.has(roomId);
        },
        get(roomId) {
            return rooms.get(roomId) || null;
        },
        set(roomId, room) {
            rooms.set(roomId, room);
        },
        remove(roomId) {
            rooms.delete(roomId);
        },
        markDirty() {
            markDirtyCalls += 1;
        },
        getMarkDirtyCalls() {
            return markDirtyCalls;
        },
        resetMarkDirtyCalls() {
            markDirtyCalls = 0;
        },
        rooms
    };
}

function createDependencies(roomStore) {
    return {
        roomStore,
        sessionService: null,
        gameService: {
            startNewRound() {
                return null;
            },
            restartRound() {
                return null;
            },
            startSingleRound() {
                return null;
            },
            restartSingleRound() {
                return null;
            },
            startDailyChallenge() {
                return null;
            }
        }
    };
}

function connectSocket(io, socket) {
    io.addSocket(socket);
    io.connectionHandler(socket);
}

test('socket disconnect is marked once across disconnecting and disconnect events', () => {
    const roomStore = createRoomStore();
    const io = createFakeIo();
    registerSocketHandlers(io, createDependencies(roomStore));
    assert.ok(io.connectionHandler, 'Expected registerSocketHandlers to attach a connection handler');

    const hostSocket = createFakeSocket({ id: 'socket-host', username: 'Host' });
    const guestSocket = createFakeSocket({ id: 'socket-guest', username: 'Guest' });

    connectSocket(io, hostSocket);
    connectSocket(io, guestSocket);

    hostSocket.trigger('joinRoom', { roomId: 'abc123', clientId: 'browser-host' });
    guestSocket.trigger('joinRoom', { roomId: 'abc123', clientId: 'browser-guest' });
    assert.equal(hostSocket.hasJoined('abc123'), true);
    assert.equal(guestSocket.hasJoined('abc123'), true);

    hostSocket.clearEmitted();
    guestSocket.clearEmitted();
    roomStore.resetMarkDirtyCalls();

    hostSocket.trigger('disconnecting');
    hostSocket.trigger('disconnect');

    const guestDisconnectUpdates = guestSocket
        .emitted('roomStateUpdate')
        .filter(event => event.payload?.reason === 'disconnect');

    assert.equal(
        guestDisconnectUpdates.length,
        1,
        'A single socket disconnect should emit one roomStateUpdate, even if both socket.io lifecycle events fire.'
    );
    assert.equal(roomStore.getMarkDirtyCalls(), 2, 'Only the first disconnect lifecycle event should dirty the room state.');

    const room = roomStore.get('abc123');
    assert.equal(room.players['socket-host'].connected, false);
    assert.equal(typeof room.players['socket-host'].disconnectedAt, 'number');
});
