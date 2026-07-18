const assert = require('node:assert/strict');
const test = require('node:test');

const { createRoom } = require('../server/rooms/roomService');
const {
    deserializeRedisRooms,
    createRedisRoomStore
} = require('../server/rooms/roomStore.redis');

const drivers = [{
    id: 'hamilton',
    name: 'Lewis Hamilton',
    difficulty: 'easy'
}];

function createDriversRepository() {
    return {
        getDriversByDifficulty() {
            return drivers;
        }
    };
}

test('Redis room store restores compact rooms and saves atomic snapshots with TTL', async () => {
    const writes = [];
    const redisClient = {
        async get(key) {
            assert.equal(key, 'f1:test:rooms:snapshot');
            return JSON.stringify({
                version: 2,
                rooms: [{
                    roomId: 'restored-room',
                    difficulty: 'easy',
                    targetDriverId: 'hamilton',
                    roundState: 'playing'
                }]
            });
        },
        async set(key, value, options) {
            writes.push({ key, value, options });
        }
    };

    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:test',
        roomTtlSeconds: 7200,
        saveDebounceMs: 0,
        driversRepository: createDriversRepository(),
        logger: { error() {} }
    });

    assert.equal(store.provider, 'redis');
    assert.equal(store.get('restored-room').targetDriver.name, 'Lewis Hamilton');

    store.set('new-room', createRoom('new-room', 'socket-1'));
    assert.equal(await store.saveNow(), 2);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].key, 'f1:test:rooms:snapshot');
    assert.deepEqual(writes[0].options, { EX: 7200 });

    const payload = JSON.parse(writes[0].value);
    assert.equal(payload.rooms.length, 2);
    assert.deepEqual(payload.rooms.find(room => room.roomId === 'new-room').players, {});
});

test('Redis room snapshot rejects malformed data instead of silently overwriting it', async () => {
    assert.throws(
        () => deserializeRedisRooms('{"rooms":"invalid"}'),
        /invalid format/
    );

    await assert.rejects(
        createRedisRoomStore({
            redisClient: {
                async get() {
                    return '{invalid-json';
                },
                async set() {}
            }
        }),
        error => error instanceof SyntaxError
    );
});
