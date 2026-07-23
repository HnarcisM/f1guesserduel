const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRoom, addPlayerToRoom, getPlayerCount, isHost } = require('../server/rooms/roomService');
const { createPersistentRoomStore } = require('../server/rooms/roomStore.persistent');
const { readPersistedRooms } = require('../server/rooms/roomPersistence');

const testDrivers = [
    {
        id: 'hamilton',
        name: 'Lewis Hamilton',
        nat: 'GBR',
        team: ['Mercedes'],
        age: 39,
        debut: 2007,
        wins: 103,
        difficulty: 'easy'
    },
    {
        id: 'verstappen',
        name: 'Max Verstappen',
        nat: 'NLD',
        team: ['Red Bull'],
        age: 26,
        debut: 2015,
        wins: 61,
        difficulty: 'easy'
    }
];

function makeTempFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-rooms-'));
    return path.join(dir, 'rooms.json');
}

function createTestDriversRepository() {
    return {
        getDriversByDifficulty(difficulty) {
            return testDrivers.filter(driver => difficulty === 'all' || driver.difficulty === difficulty);
        }
    };
}

test('persistent room store saves compact rooms and restores round state from driver repository', async () => {
    const filePath = makeTempFile();
    const driversRepository = createTestDriversRepository();
    const store = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const room = createRoom('abc123', 'old-socket');

    room.difficulty = 'easy';
    room.targetDriver = { ...testDrivers[0], internalOnlyField: 'should-not-be-persisted' };
    room.driversList = testDrivers.map(driver => ({ ...driver, heavyRuntimeField: 'should-not-be-persisted' }));
    room.roundState = 'playing';
    room.roundStartedAt = 12345;

    store.set(room.roomId, room);
    await store.saveNow();
    room.inactiveSince = 67890;
    store.markDirty(room.roomId, { touchActivity: false });
    await store.saveNow();

    const persistedPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(persistedPayload.version, 3);
    assert.equal(persistedPayload.rooms[0].targetDriverId, 'hamilton');
    assert.equal(Object.hasOwn(persistedPayload.rooms[0], 'targetDriver'), false);
    assert.equal(Object.hasOwn(persistedPayload.rooms[0], 'driversList'), false);
    assert.equal(persistedPayload.rooms[0].inactiveSince, 67890);
    assert.equal(persistedPayload.rooms[0].lobbyBestOf, 3);
    assert.equal(persistedPayload.rooms[0].matchState.winsRequired, 2);

    const restoredRooms = readPersistedRooms(filePath, { driversRepository });
    assert.equal(restoredRooms.length, 1);
    assert.equal(restoredRooms[0].roomId, 'abc123');
    assert.equal(restoredRooms[0].difficulty, 'easy');
    assert.equal(restoredRooms[0].targetDriver.name, 'Lewis Hamilton');
    assert.equal(restoredRooms[0].targetDriver.nat, 'GBR');
    assert.equal(restoredRooms[0].driversList.length, 2);
    assert.equal(restoredRooms[0].roundState, 'playing');
    assert.equal(restoredRooms[0].inactiveSince, 67890);
    assert.equal(restoredRooms[0].lobbyBestOf, 3);
    assert.equal(restoredRooms[0].matchState.status, 'waiting');
    assert.equal(Object.keys(restoredRooms[0].players).length, 0);
    assert.equal(Object.keys(restoredRooms[0].spectators).length, 0);
    assert.equal(restoredRooms[0].hostId, null);
});

test('persistent room store hydrates compact persisted rooms when it starts', async () => {
    const filePath = makeTempFile();
    const driversRepository = createTestDriversRepository();
    const originalStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const room = createRoom('abc123', 'old-socket');

    room.difficulty = 'easy';
    room.targetDriver = testDrivers[1];
    room.driversList = testDrivers;
    room.roundState = 'playing';
    originalStore.set(room.roomId, room);
    await originalStore.saveNow();

    const restoredStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const restoredRoom = restoredStore.get('abc123');

    assert.equal(restoredRoom.targetDriver.id, 'verstappen');
    assert.equal(restoredRoom.targetDriver.name, 'Max Verstappen');
    assert.equal(restoredRoom.driversList.length, 2);
});

test('first player joining a restored empty room becomes host', async () => {
    const filePath = makeTempFile();
    const driversRepository = createTestDriversRepository();
    const originalStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const room = createRoom('abc123', 'old-socket');
    originalStore.set(room.roomId, room);
    await originalStore.saveNow();

    const restoredStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const restoredRoom = restoredStore.get('abc123');

    assert.equal(getPlayerCount(restoredRoom), 0);

    addPlayerToRoom(restoredRoom, 'new-socket');

    assert.equal(getPlayerCount(restoredRoom), 1);
    assert.equal(isHost(restoredRoom, 'new-socket'), true);
});

test('legacy persisted rooms with full target and drivers list can still be restored', () => {
    const filePath = makeTempFile();
    fs.writeFileSync(filePath, `${JSON.stringify({
        version: 1,
        rooms: [{
            roomId: 'legacy123',
            targetDriver: testDrivers[0],
            difficulty: 'easy',
            driversList: testDrivers,
            roundState: 'playing'
        }]
    })}\n`, 'utf8');

    const restoredRooms = readPersistedRooms(filePath);

    assert.equal(restoredRooms.length, 1);
    assert.equal(restoredRooms[0].roomId, 'legacy123');
    assert.equal(restoredRooms[0].targetDriver.name, 'Lewis Hamilton');
    assert.equal(restoredRooms[0].driversList.length, 2);
    assert.equal(restoredRooms[0].roundState, 'playing');
});

test('async room persistence coalesces changes made while a save is running', async () => {
    const snapshots = [];
    let releaseFirstWrite;
    const firstWriteFinished = new Promise(resolve => {
        releaseFirstWrite = resolve;
    });
    const store = createPersistentRoomStore({
        persistenceFilePath: makeTempFile(),
        saveDebounceMs: 0,
        async writePersistedRooms(filePath, rooms) {
            snapshots.push(rooms.map(room => room.roomId));
            if (snapshots.length === 1) await firstWriteFinished;
            return rooms.length;
        }
    });

    store.set('first', createRoom('first', 'socket-1'));
    store.set('second', createRoom('second', 'socket-2'));

    const flushPromise = store.saveNow();
    assert.deepEqual(snapshots, [['first']]);

    releaseFirstWrite();
    const savedRoomCount = await flushPromise;

    assert.equal(savedRoomCount, 2);
    assert.deepEqual(snapshots, [['first'], ['first', 'second']]);
});

test('async room persistence records failures and can retry the latest state', async () => {
    const writeError = new Error('disk unavailable');
    const loggedErrors = [];
    let attempts = 0;
    const store = createPersistentRoomStore({
        persistenceFilePath: makeTempFile(),
        saveDebounceMs: 0,
        async writePersistedRooms(filePath, rooms) {
            attempts += 1;
            if (attempts === 1) throw writeError;
            return rooms.length;
        },
        logger: {
            error(message, metadata) {
                loggedErrors.push({ message, metadata });
            }
        }
    });

    store.set('retry-room', createRoom('retry-room', 'socket-1'));
    await assert.rejects(store.saveNow(), /disk unavailable/);

    assert.equal(store.getLastSaveError(), writeError);
    assert.equal(loggedErrors.length, 1);

    assert.equal(await store.saveNow(), 1);
    assert.equal(store.getLastSaveError(), null);
    assert.equal(attempts, 2);
});

test('room store close waits for pending writes and is idempotent', async () => {
    let releaseWrite;
    let writeCalls = 0;
    const writeFinished = new Promise(resolve => {
        releaseWrite = resolve;
    });
    const store = createPersistentRoomStore({
        persistenceFilePath: makeTempFile(),
        saveDebounceMs: 0,
        async writePersistedRooms(filePath, rooms) {
            writeCalls += 1;
            await writeFinished;
            return rooms.length;
        }
    });

    store.set('closing-room', createRoom('closing-room', 'socket-1'));
    const firstClose = store.close();
    const secondClose = store.close();

    assert.equal(firstClose, secondClose);
    assert.equal(writeCalls, 1);

    releaseWrite();
    assert.equal(await firstClose, 1);
    assert.equal(writeCalls, 1);
});
