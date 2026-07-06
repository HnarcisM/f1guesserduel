const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');
const { createRoom } = require('../server/rooms/roomService');

function createFakeSocket(id = 'socket-1') {
    const handlers = new Map();
    const emitted = [];

    return {
        id,
        user: null,
        handshake: { headers: { cookie: '' } },
        on(eventName, handler) { handlers.set(eventName, handler); },
        emit(eventName, payload) { emitted.push({ eventName, payload }); },
        trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected handler for ${eventName}`);
            return handler(payload);
        },
        join() {},
        leave() {},
        emitted(eventName) { return emitted.filter(event => event.eventName === eventName); }
    };
}

function createFakeIo() {
    const emitted = [];
    return {
        middleware: null,
        connectionHandler: null,
        sockets: { sockets: new Map() },
        use(fn) { this.middleware = fn; },
        on(eventName, handler) {
            if (eventName === 'connection') this.connectionHandler = handler;
        },
        emit(eventName, payload) { emitted.push({ eventName, payload }); },
        emitted(eventName) { return emitted.filter(event => event.eventName === eventName); },
        to() { return { emit() {} }; }
    };
}

function createRoomStore(initialRooms = []) {
    const rooms = new Map(initialRooms.map(room => [room.roomId, room]));
    return {
        has(roomId) { return rooms.has(roomId); },
        get(roomId) { return rooms.get(roomId) || null; },
        set(roomId, room) { rooms.set(roomId, room); },
        remove(roomId) { rooms.delete(roomId); },
        values() { return [...rooms.values()]; },
        markDirty() {}
    };
}

function createDependencies(roomStore) {
    return {
        roomStore,
        sessionService: null,
        socketRateLimit: { enabled: false },
        gameService: {
            startSingleRound() { return null; },
            restartSingleRound() { return null; },
            startDailyChallenge() { return null; },
            startNewRound() { return null; },
            restartRound() { return null; }
        }
    };
}

test('requestRoomList returns active Duel rooms to the requesting socket', () => {
    const hostSocket = createFakeSocket('socket-host');
    const requesterSocket = createFakeSocket('socket-viewer');
    const io = createFakeIo();
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(requesterSocket.id, requesterSocket);

    const room = createRoom('ROOM123', hostSocket.id, { id: 1, username: 'Narcis' }, { clientId: 'host-client' });
    const roomStore = createRoomStore([room]);

    registerSocketHandlers(io, createDependencies(roomStore));
    io.connectionHandler(requesterSocket);

    requesterSocket.trigger('requestRoomList');

    const updates = requesterSocket.emitted('roomListUpdate');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].payload.rooms.length, 1);
    assert.equal(updates[0].payload.rooms[0].roomId, 'ROOM123');
    assert.equal(updates[0].payload.rooms[0].hostUsername, 'Narcis');
});

test('joining a room broadcasts an updated Duel room list', () => {
    const io = createFakeIo();
    const socket = createFakeSocket('socket-host');
    socket.user = { id: 1, username: 'Host' };
    io.sockets.sockets.set(socket.id, socket);

    const roomStore = createRoomStore();

    registerSocketHandlers(io, createDependencies(roomStore));
    io.connectionHandler(socket);

    socket.trigger('joinRoom', { roomId: 'ROOMNEW', clientId: 'host-client' });

    const updates = io.emitted('roomListUpdate');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].payload.rooms[0].roomId, 'ROOMNEW');
    assert.equal(updates[0].payload.rooms[0].playerCount, 1);
});
