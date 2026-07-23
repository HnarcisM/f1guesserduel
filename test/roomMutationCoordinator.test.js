const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoomMutationCoordinator } = require('../server/socket/roomMutationCoordinator');

function createSocket() {
    const emitted = [];
    return {
        id: 'socket-a',
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        emitted
    };
}

test('room mutation coordinator locks only valid distributed room events', async () => {
    const calls = [];
    const socket = createSocket();
    const state = { currentRoom: 'room-a' };
    const coordinator = createRoomMutationCoordinator({
        roomStore: {
            async runExclusive(roomId, handler) {
                calls.push(roomId);
                return handler();
            }
        },
        state,
        socket,
        logger: { error() {} }
    });

    const submitGuess = coordinator.coordinateEventHandler('submitGuess', value => `guess:${value}`);
    const invalidJoin = coordinator.coordinateEventHandler('joinRoom', () => 'invalid');

    assert.equal(await submitGuess('driver-a'), 'guess:driver-a');
    assert.equal(await invalidJoin({ roomId: 'invalid:room' }), 'invalid');
    assert.deepEqual(calls, ['room-a']);
});

test('room mutation coordinator contains lock timeouts and emits a retry message', async () => {
    const socket = createSocket();
    const logs = [];
    const coordinator = createRoomMutationCoordinator({
        roomStore: {
            async runExclusive() {
                const error = new Error('busy');
                error.code = 'ROOM_LOCK_TIMEOUT';
                throw error;
            }
        },
        state: { currentRoom: 'room-a' },
        socket,
        logger: {
            error(message, metadata) {
                logs.push({ message, metadata });
            }
        }
    });

    const handler = coordinator.coordinateEventHandler('restartGame', () => 'not-called');
    assert.equal(await handler(), undefined);
    assert.equal(socket.emitted[0].eventName, 'errorMessage');
    assert.match(socket.emitted[0].payload, /ocupată momentan/);
    assert.equal(logs.length, 1);
});
