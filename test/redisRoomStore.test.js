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
    const persistedRoom = JSON.parse(redisClient.transactions[0][0].value).room;
    assert.equal(persistedRoom.hostId, 'socket-1');
    assert.equal(persistedRoom.players['socket-1'].username, 'Guest 1');
    assert.equal(persistedRoom.players['socket-1'].ready, false);

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
        fs.readFileSync(path.join(root, 'server', 'socket', 'duelLobbySocketHandlers.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'server', 'socket', 'duelLifecycleSocketHandlers.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'server', 'socket', 'duelRoundSocketHandlers.js'), 'utf8')
    ].join('\n');

    assert.doesNotMatch(socketSources, /roomStore\.markDirty\?\.\(\s*\)/);
    assert.match(socketSources, /roomStore\.markDirty\?\.\(roomId\)/);
    assert.doesNotMatch(socketSources, /roomStore\.markDirty\?\.\(state\.currentRoom\)/);
});

function createSharedRedisBackend() {
    const data = new Map();
    const expiresAt = new Map();
    const subscribers = new Map();

    function purgeExpired(key) {
        const deadline = expiresAt.get(key);
        if (deadline !== undefined && deadline <= Date.now()) {
            data.delete(key);
            expiresAt.delete(key);
        }
    }

    function createClient({ connected = true } = {}) {
        const listeners = new Map();
        const subscriptions = new Map();

        const client = {
            isOpen: connected,
            on(eventName, handler) {
                listeners.set(eventName, handler);
            },
            async connect() {
                this.isOpen = true;
            },
            async quit() {
                for (const [channel, handler] of subscriptions) {
                    subscribers.get(channel)?.delete(handler);
                }
                subscriptions.clear();
                this.isOpen = false;
            },
            destroy() {
                this.isOpen = false;
            },
            duplicate() {
                return createClient({ connected: false });
            },
            async subscribe(channel, handler) {
                if (!subscribers.has(channel)) subscribers.set(channel, new Set());
                subscribers.get(channel).add(handler);
                subscriptions.set(channel, handler);
            },
            async publish(channel, message) {
                const handlers = [...(subscribers.get(channel) || [])];
                for (const handler of handlers) handler(message);
                return handlers.length;
            },
            async get(key) {
                purgeExpired(key);
                return data.get(key) ?? null;
            },
            async mGet(keys) {
                return Promise.all(keys.map(key => this.get(key)));
            },
            async * scanIterator({ MATCH }) {
                const prefix = MATCH.endsWith('*') ? MATCH.slice(0, -1) : MATCH;
                for (const key of [...data.keys()]) purgeExpired(key);
                yield [...data.keys()].filter(key => key.startsWith(prefix));
            },
            async set(key, value, options = {}) {
                purgeExpired(key);
                if (options.NX && data.has(key)) return null;
                data.set(key, value);
                if (Number.isFinite(options.PX)) expiresAt.set(key, Date.now() + options.PX);
                else if (Number.isFinite(options.EX)) expiresAt.set(key, Date.now() + options.EX * 1000);
                else expiresAt.delete(key);
                return 'OK';
            },
            async del(key) {
                expiresAt.delete(key);
                return data.delete(key) ? 1 : 0;
            },
            async eval(script, { keys, arguments: args }) {
                const [key] = keys;
                const [token, ttl] = args;
                purgeExpired(key);
                if (data.get(key) !== token) return 0;
                if (script.includes('PEXPIRE')) {
                    expiresAt.set(key, Date.now() + Number(ttl));
                    return 1;
                }
                data.delete(key);
                expiresAt.delete(key);
                return 1;
            },
            multi() {
                const commands = [];
                return {
                    set(key, value, options) {
                        commands.push(() => client.set(key, value, options));
                        return this;
                    },
                    del(key) {
                        commands.push(() => client.del(key));
                        return this;
                    },
                    async exec() {
                        const results = [];
                        for (const command of commands) results.push(await command());
                        return results;
                    }
                };
            }
        };
        return client;
    }

    return { createClient, data };
}

test('distributed Redis room mutations serialize concurrent writers and synchronize instances', async () => {
    const backend = createSharedRedisBackend();
    const commonOptions = {
        keyPrefix: 'f1:cluster',
        roomTtlSeconds: 3600,
        saveDebounceMs: 60_000,
        distributedCoordinationEnabled: true,
        roomLockTtlMs: 2_000,
        roomLockWaitTimeoutMs: 1_000,
        logger: { error() {}, info() {} }
    };
    const firstStore = await createRedisRoomStore({
        ...commonOptions,
        redisClient: backend.createClient(),
        instanceId: 'node-a'
    });
    const secondStore = await createRedisRoomStore({
        ...commonOptions,
        redisClient: backend.createClient(),
        instanceId: 'node-b'
    });

    await firstStore.runExclusive('shared-room', () => {
        const room = createRoom('shared-room', 'socket-a');
        room.nextGuestNumber = 1;
        firstStore.set('shared-room', room);
    });
    assert.equal(secondStore.get('shared-room').nextGuestNumber, 1);

    await Promise.all([
        firstStore.runExclusive('shared-room', async () => {
            const room = firstStore.get('shared-room');
            const value = room.nextGuestNumber;
            await new Promise(resolve => setTimeout(resolve, 40));
            room.nextGuestNumber = value + 1;
            firstStore.markDirty('shared-room');
        }),
        secondStore.runExclusive('shared-room', () => {
            const room = secondStore.get('shared-room');
            room.nextGuestNumber += 1;
            secondStore.markDirty('shared-room');
        })
    ]);

    const storedPayload = JSON.parse(backend.data.get(buildRedisRoomKey('f1:cluster', 'shared-room')));
    assert.equal(storedPayload.room.nextGuestNumber, 3);
    assert.equal(firstStore.get('shared-room').nextGuestNumber, 3);
    assert.equal(secondStore.get('shared-room').nextGuestNumber, 3);

    await Promise.all([firstStore.close(), secondStore.close()]);
});


test('distributed Redis room lock lease is renewed during long mutations', async () => {
    const backend = createSharedRedisBackend();
    const options = {
        keyPrefix: 'f1:lease',
        distributedCoordinationEnabled: true,
        roomLockTtlMs: 30,
        roomLockWaitTimeoutMs: 500,
        saveDebounceMs: 60_000,
        logger: { error() {}, info() {} }
    };
    const firstStore = await createRedisRoomStore({
        ...options,
        redisClient: backend.createClient(),
        instanceId: 'lease-a'
    });
    const secondStore = await createRedisRoomStore({
        ...options,
        redisClient: backend.createClient(),
        instanceId: 'lease-b'
    });

    await firstStore.runExclusive('lease-room', () => {
        const room = createRoom('lease-room', 'socket-a');
        room.nextGuestNumber = 1;
        firstStore.set('lease-room', room);
    });

    await Promise.all([
        firstStore.runExclusive('lease-room', async () => {
            const room = firstStore.get('lease-room');
            const value = room.nextGuestNumber;
            await new Promise(resolve => setTimeout(resolve, 90));
            room.nextGuestNumber = value + 1;
            firstStore.markDirty('lease-room');
        }),
        new Promise(resolve => setTimeout(resolve, 45)).then(() => secondStore.runExclusive('lease-room', () => {
            const room = secondStore.get('lease-room');
            room.nextGuestNumber += 1;
            secondStore.markDirty('lease-room');
        }))
    ]);

    const payload = JSON.parse(backend.data.get(buildRedisRoomKey('f1:lease', 'lease-room')));
    assert.equal(payload.room.nextGuestNumber, 3);
    await Promise.all([firstStore.close(), secondStore.close()]);
});

test('distributed Redis room store reports lock contention instead of overwriting state', async () => {
    const backend = createSharedRedisBackend();
    const redisClient = backend.createClient();
    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:locks',
        distributedCoordinationEnabled: true,
        roomLockTtlMs: 1_000,
        roomLockWaitTimeoutMs: 10,
        instanceId: 'node-a',
        logger: { error() {}, info() {} }
    });
    await redisClient.set('f1:locks:rooms:lock:busy-room', 'other-owner', { PX: 1_000 });

    await assert.rejects(
        store.runExclusive('busy-room', () => {}),
        error => error?.code === 'ROOM_LOCK_TIMEOUT'
    );

    await store.close();
});


test('distributed room persistence survives auxiliary publish and lock release errors', async () => {
    const backend = createSharedRedisBackend();
    const redisClient = backend.createClient();
    const logMessages = [];
    redisClient.publish = async () => {
        throw new Error('Pub/Sub unavailable');
    };
    const originalEval = redisClient.eval.bind(redisClient);
    redisClient.eval = async (script, options) => {
        if (script.includes('PEXPIRE')) return originalEval(script, options);
        throw new Error('Lock release unavailable');
    };
    const store = await createRedisRoomStore({
        redisClient,
        keyPrefix: 'f1:resilience',
        distributedCoordinationEnabled: true,
        roomLockTtlMs: 100,
        roomLockWaitTimeoutMs: 50,
        instanceId: 'node-a',
        logger: {
            info() {},
            error(message) {
                logMessages.push(message);
            }
        }
    });

    const result = await store.runExclusive('resilient-room', () => {
        const room = createRoom('resilient-room', 'socket-a');
        store.set('resilient-room', room);
        return 'persisted';
    });

    assert.equal(result, 'persisted');
    assert.equal(
        backend.data.has(buildRedisRoomKey('f1:resilience', 'resilient-room')),
        true
    );
    assert.equal(logMessages.some(message => /Publicarea sincronizării Redis/.test(message)), true);
    assert.equal(logMessages.some(message => /Eliberarea lock-ului Redis/.test(message)), true);

    await store.close();
});
