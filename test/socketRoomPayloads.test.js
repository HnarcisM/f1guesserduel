const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeJoinRoomPayload,
    buildPlayerProgressPayload
} = require('../server/socket/socketRoomPayloads');

test('normalizeJoinRoomPayload accepts legacy string room ids', () => {
    assert.deepEqual(normalizeJoinRoomPayload('abc123'), {
        roomId: 'abc123',
        clientId: null
    });
});

test('normalizeJoinRoomPayload keeps object payload fields defensive', () => {
    assert.deepEqual(normalizeJoinRoomPayload({ roomId: 'abc123', clientId: 'browser-1' }), {
        roomId: 'abc123',
        clientId: 'browser-1'
    });
    assert.deepEqual(normalizeJoinRoomPayload({ roomId: 123, clientId: {} }), {
        roomId: null,
        clientId: null
    });
});

test('buildPlayerProgressPayload returns null for missing player', () => {
    assert.equal(buildPlayerProgressPayload(null), null);
});

test('buildPlayerProgressPayload exposes only safe progress fields', () => {
    const progress = buildPlayerProgressPayload({
        attempts: 2,
        finished: true,
        timedOut: false,
        correctGuess: true,
        userId: 'secret-user',
        socketId: 'secret-socket',
        guesses: [{
            attempt: 1,
            guess: { id: 'driver-1', name: 'Driver One' },
            results: { team: 'correct' },
            isCorrect: true,
            isGameOver: true,
            internalNote: 'hidden'
        }]
    });

    assert.deepEqual(progress, {
        attempts: 2,
        finished: true,
        timedOut: false,
        correctGuess: true,
        guesses: [{
            attempt: 1,
            guess: { id: 'driver-1', name: 'Driver One' },
            results: { team: 'correct' },
            isCorrect: true,
            isGameOver: true
        }]
    });
});
