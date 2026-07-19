const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createRoom } = require('../server/rooms/roomService');
const {
    buildRedisRoomKey,
    deserializeRedisRoom,
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

function createRoomPayload(roomId, overrides = {}) {
    return JSON.stringify({
        version: 2,
        savedAt: '2026-01-01T00:00:00.000Z',
        room: {
            roomId,
            difficulty: 'easy',
            targetDriverId: 'hamilton',
            roundState: 'playing',
            ...overrides
        }
    });
}

function createRedisStub(initialEntries = {}, { failedTransactions = 0 } = {}) {
    const data = new Map(Object.entries(initialEntries));
    const transactions = [];
    let remainingFailures = failedTransactions;

    const client = {
        data,
        transactions,
        async get(key) {
            return data.get(key) ?? null;
        },
        async mGet(keys) {
            return keys.map(key => data.get(key) ?? null);
        },
        async * scanIterator({ MATCH }) {
            const prefix = MATCH.endsWith('*') ? MATCH.slice(0, -1) : MATCH;
            yield [...data.keys()].filter(key => key.startsWith(prefix));
        },
        async set(key, value, options) {
            data.set(key, value);
            transactions.push([{ command: 'set', key, value, options }]);
        },
        async del(key) {
            const removed = data.delete(key) ? 1 : 0;
            transactions.push([{ command: 'del', key }]);
            return removed;
        },
        multi() {
            const commands = [];
            return {
                set(key, value, options) {
                    commands.push({ command: 'set', key, value, options });
                    return this;
                },
                del(key) {
                    commands.push({ command: 'del', key });
                    return this;
                },
                async exec() {
                    transactions.push(commands);
                    if (remainingFailures > 0) {
                        remainingFailures -= 1;
                        throw new Error('Redis unavailable');
                    }
                    for (const command of commands) {
                        if (command.command === 'set') data.set(command.key, command.value);
                        else data.delete(command.key);
                    }
                    return commands.map(() => 'OK');
                }
            };
        }
    };

    return client;
}

test('Redis room store restores separate keys and persists only the changed room with TTL', async () => {
    const restoredKey = buildRedisRoomKey('f1:test', 'restored-room');
    const redisClient = createRedisStub({
        [restoredKey]: createRoomPayload('restored-room')
    });
    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:test',
        roomTtlSeconds: 7200,
        saveDebounceMs: 60_000,
        driversRepository: createDriversRepository(),
        logger: { error() {}, info() {} }
    });

    assert.equal(store.provider, 'redis');
    assert.equal(store.get('restored-room').targetDriver.name, 'Lewis Hamilton');

    store.set('new-room', createRoom('new-room', 'socket-1'));
    assert.equal(await store.saveNow(), 2);
    assert.equal(redisClient.transactions.length, 1);
    assert.deepEqual(redisClient.transactions[0].map(command => command.key), [
        buildRedisRoomKey('f1:test', 'new-room')
    ]);
    assert.deepEqual(redisClient.transactions[0][0].options, { EX: 7200 });
    assert.deepEqual(JSON.parse(redisClient.transactions[0][0].value).room.players, {});

    store.get('restored-room').roundState = 'waiting';
    store.markDirty('restored-room');
    await store.saveNow();
    assert.deepEqual(redisClient.transactions[1].map(command => command.key), [restoredKey]);

    store.remove('new-room');
    assert.equal(await store.saveNow(), 1);
    assert.deepEqual(redisClient.transactions[2], [{
        command: 'del',
        key: buildRedisRoomKey('f1:test', 'new-room')
    }]);
    assert.equal(redisClient.data.has(buildRedisRoomKey('f1:test', 'new-room')), false);
});

test('Redis room store migrates the legacy snapshot without overwriting newer room keys', async () => {
    const legacyKey = 'f1:test:rooms:snapshot';
    const currentRoomKey = buildRedisRoomKey('f1:test', 'current-room');
    const redisClient = createRedisStub({
        [currentRoomKey]: createRoomPayload('current-room', { roundState: 'waiting' }),
        [legacyKey]: JSON.stringify({
            version: 2,
            rooms: [
                { roomId: 'current-room', roundState: 'playing' },
                { roomId: 'legacy-room', difficulty: 'easy', targetDriverId: 'hamilton' }
            ]
        })
    });
    const infoLogs = [];

    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:test',
        roomTtlSeconds: 3600,
        saveDebounceMs: 60_000,
        driversRepository: createDriversRepository(),
        logger: { error() {}, info(message, metadata) { infoLogs.push({ message, metadata }); } }
    });

    assert.equal(store.get('current-room').roundState, 'waiting');
    assert.ok(store.get('legacy-room'));
    assert.equal(redisClient.data.has(legacyKey), false);
    assert.equal(redisClient.data.has(buildRedisRoomKey('f1:test', 'legacy-room')), true);
    assert.equal(redisClient.transactions.length, 1);
    assert.deepEqual(redisClient.transactions[0].map(command => command.command), ['set', 'del']);
    assert.deepEqual(redisClient.transactions[0][0].options, { EX: 3600 });
    assert.equal(infoLogs[0].metadata.migratedRoomCount, 1);
});

test('legacy Redis snapshot remains available when its migration fails', async () => {
    const legacyKey = 'f1:test:rooms:snapshot';
    const legacyPayload = JSON.stringify({
        version: 2,
        rooms: [{ roomId: 'legacy-room', difficulty: 'easy' }]
    });
    const redisClient = createRedisStub({
        [legacyKey]: legacyPayload
    }, { failedTransactions: 1 });

    await assert.rejects(
        createRedisRoomStore({
            redisClient,
            keyPrefix: 'f1:test',
            logger: { error() {}, info() {} }
        }),
        /Redis unavailable/
    );

    assert.equal(redisClient.data.get(legacyKey), legacyPayload);
    assert.equal(redisClient.data.has(buildRedisRoomKey('f1:test', 'legacy-room')), false);
});

test('Redis room writes remain pending and can be retried after a transaction failure', async () => {
    const redisClient = createRedisStub({}, { failedTransactions: 1 });
    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:test',
        saveDebounceMs: 60_000,
        logger: { error() {}, info() {} }
    });

    store.set('retry-room', createRoom('retry-room', 'socket-1'));
    await assert.rejects(store.saveNow(), /Redis unavailable/);
    assert.match(store.getLastSaveError().message, /Redis unavailable/);

    assert.equal(await store.saveNow(), 1);
    assert.equal(store.getLastSaveError(), null);
    assert.equal(redisClient.data.has(buildRedisRoomKey('f1:test', 'retry-room')), true);
});

test('Redis room payload validation rejects malformed snapshots, entries and mismatched keys', async () => {
    assert.throws(
        () => buildRedisRoomKey('f1:test', 'invalid:room'),
        /valid room id/
    );
    assert.throws(
        () => deserializeRedisRooms('{"rooms":"invalid"}'),
        /invalid format/
    );
    assert.throws(
        () => deserializeRedisRoom('{"room":null}'),
        /invalid format/
    );

    await assert.rejects(
        createRedisRoomStore({
            redisClient: createRedisStub({
                [buildRedisRoomKey('f1:test', 'expected-room')]: createRoomPayload('different-room')
            }),
            keyPrefix: 'f1:test'
        }),
        /does not match/
    );

    await assert.rejects(
        createRedisRoomStore({
            redisClient: createRedisStub({
                'f1:test:rooms:snapshot': '{invalid-json'
            }),
            keyPrefix: 'f1:test'
        }),
        error => error instanceof SyntaxError
    );
});

test('socket room mutations identify the affected room for scoped Redis writes', () => {
    const root = path.join(__dirname, '..');
    const socketSources = [
        fs.readFileSync(path.join(root, 'server', 'socket', 'roomStateEmitter.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'server', 'socket', 'registerSocketHandlers.js'), 'utf8')
    ].join('\n');

    assert.doesNotMatch(socketSources, /roomStore\.markDirty\?\.\(\s*\)/);
    assert.match(socketSources, /roomStore\.markDirty\?\.\(roomId\)/);
    assert.match(socketSources, /roomStore\.markDirty\?\.\(currentRoom\)/);
});
