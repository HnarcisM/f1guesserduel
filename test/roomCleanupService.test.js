const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomCleanupService } = require('../server/rooms/roomCleanupService');
const { createRoom, addPlayerToRoom } = require('../server/rooms/roomService');

const INACTIVE_TTL_MS = 30 * 60 * 1000;

function createRoomStore(initialRooms = []) {
    const rooms = new Map(initialRooms.map(room => [room.roomId, room]));
    const dirtyCalls = [];
    const removedRoomIds = [];

    return {
        dirtyCalls,
        removedRoomIds,
        get(roomId) {
            return rooms.get(roomId) || null;
        },
        values() {
            return [...rooms.values()];
        },
        markDirty(roomId, options) {
            dirtyCalls.push({ roomId, options });
        },
        remove(roomId) {
            const removed = rooms.delete(roomId);
            if (removed) removedRoomIds.push(roomId);
            return removed;
        }
    };
}

function createReconnectableRoom(roomId, socketId) {
    return createRoom(roomId, socketId, null, { clientId: `client-${roomId}` });
}

test('periodic room cleanup removes only rooms inactive for 30 minutes', () => {
    const now = 2_000_000;
    const activeRoom = createReconnectableRoom('active-room', 'socket-active');
    activeRoom.inactiveSince = now - INACTIVE_TTL_MS;
    const expiredRoom = createReconnectableRoom('expired-room', 'socket-expired');
    expiredRoom.inactiveSince = now - INACTIVE_TTL_MS;
    const recentRoom = createReconnectableRoom('recent-room', 'socket-recent');
    const roomStore = createRoomStore([activeRoom, expiredRoom, recentRoom]);
    const activeSocketIds = new Set(['socket-active']);
    const roomEvents = [];
    const service = createRoomCleanupService({
        roomStore,
        isSocketActive: socketId => activeSocketIds.has(socketId),
        inactiveTtlMs: INACTIVE_TTL_MS,
        clock: () => now,
        logger: { info() {}, error() {} },
        metrics: {
            recordRoomEvent(event) {
                roomEvents.push(event);
            }
        }
    });

    const result = service.cleanupInactiveRooms();

    assert.deepEqual(result, {
        scannedRoomCount: 3,
        updatedRoomCount: 2,
        removedRoomCount: 1
    });
    assert.equal(roomStore.get('active-room').inactiveSince, null);
    assert.equal(roomStore.get('recent-room').inactiveSince, now);
    assert.equal(roomStore.get('expired-room'), null);
    assert.deepEqual(roomStore.removedRoomIds, ['expired-room']);
    assert.ok(roomStore.dirtyCalls.every(call => call.options.touchActivity === false));
    assert.deepEqual(roomEvents, ['inactive_cleanup']);
});

test('disconnected members keep their room through reconnect grace and inactive TTL', () => {
    let now = 5_000_000;
    const room = createReconnectableRoom('grace-room', 'socket-old');
    const roomStore = createRoomStore([room]);
    const reconnectEvents = [];
    const service = createRoomCleanupService({
        roomStore,
        isSocketActive: () => false,
        inactiveTtlMs: INACTIVE_TTL_MS,
        clock: () => now,
        logger: { info() {}, error() {} },
        metrics: {
            recordReconnect(event) {
                reconnectEvents.push(event);
            }
        }
    });

    service.cleanupInactiveRooms();
    assert.equal(room.inactiveSince, now);
    assert.ok(room.players['socket-old']);

    now += (2 * 60 * 1000) + 1;
    service.cleanupInactiveRooms();
    assert.equal(Object.keys(room.players).length, 0);
    assert.ok(roomStore.get('grace-room'));
    assert.equal(reconnectEvents[0].outcome, 'grace_expired');
    assert.equal(reconnectEvents[0].role, 'player');
    assert.ok(reconnectEvents[0].durationMs > 2 * 60 * 1000);

    now = 5_000_000 + INACTIVE_TTL_MS - 1;
    service.cleanupInactiveRooms();
    assert.ok(roomStore.get('grace-room'));

    now += 1;
    service.cleanupInactiveRooms();
    assert.equal(roomStore.get('grace-room'), null);
});

test('unchanged inactive rooms are not persisted on every cleanup cycle', () => {
    let now = 6_000_000;
    const room = createReconnectableRoom('quiet-room', 'socket-old');
    const roomStore = createRoomStore([room]);
    const service = createRoomCleanupService({
        roomStore,
        isSocketActive: () => false,
        inactiveTtlMs: INACTIVE_TTL_MS,
        clock: () => now,
        logger: { info() {}, error() {} }
    });

    assert.equal(service.cleanupInactiveRooms().updatedRoomCount, 1);
    assert.equal(roomStore.dirtyCalls.length, 1);

    now += 60_000;
    assert.equal(service.cleanupInactiveRooms().updatedRoomCount, 0);
    assert.equal(roomStore.dirtyCalls.length, 1);
});

test('a reconnect clears the inactive countdown', () => {
    let now = 8_000_000;
    const room = createReconnectableRoom('reconnect-room', 'socket-old');
    const roomStore = createRoomStore([room]);
    const activeSocketIds = new Set();
    const service = createRoomCleanupService({
        roomStore,
        isSocketActive: socketId => activeSocketIds.has(socketId),
        inactiveTtlMs: INACTIVE_TTL_MS,
        clock: () => now,
        logger: { info() {}, error() {} }
    });

    service.cleanupInactiveRooms();
    now += 10 * 60 * 1000;
    addPlayerToRoom(room, 'socket-new', null, { clientId: 'client-reconnect-room' });
    activeSocketIds.add('socket-new');
    service.cleanupInactiveRooms();

    assert.equal(room.inactiveSince, null);
    assert.ok(roomStore.get('reconnect-room'));
});

test('room cleanup timer is unrefed, stoppable and contains cleanup failures', () => {
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    let intervalCallback = null;
    let intervalDelay = null;
    let clearedTimer = null;
    const errors = [];
    const service = createRoomCleanupService({
        roomStore: {
            values() { throw new Error('cleanup failure'); },
            remove() { return false; }
        },
        isSocketActive: () => false,
        cleanupIntervalMs: 60_000,
        logger: { info() {}, error(message, metadata) { errors.push({ message, metadata }); } },
        setIntervalFn(callback, delay) {
            intervalCallback = callback;
            intervalDelay = delay;
            return timer;
        },
        clearIntervalFn(value) {
            clearedTimer = value;
        }
    });

    const stop = service.start();
    assert.equal(intervalDelay, 60_000);
    assert.equal(timer.unrefCalled, true);
    assert.equal(intervalCallback(), null);
    assert.match(errors[0].metadata.error.message, /cleanup failure/);

    stop();
    assert.equal(clearedTimer, timer);
});
