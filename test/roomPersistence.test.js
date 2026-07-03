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

test('persistent room store saves compact rooms and restores round state from driver repository', () => {
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

    const persistedPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(persistedPayload.version, 2);
    assert.equal(persistedPayload.rooms[0].targetDriverId, 'hamilton');
    assert.equal(Object.hasOwn(persistedPayload.rooms[0], 'targetDriver'), false);
    assert.equal(Object.hasOwn(persistedPayload.rooms[0], 'driversList'), false);

    const restoredRooms = readPersistedRooms(filePath, { driversRepository });
    assert.equal(restoredRooms.length, 1);
    assert.equal(restoredRooms[0].roomId, 'abc123');
    assert.equal(restoredRooms[0].difficulty, 'easy');
    assert.equal(restoredRooms[0].targetDriver.name, 'Lewis Hamilton');
    assert.equal(restoredRooms[0].targetDriver.nat, 'GBR');
    assert.equal(restoredRooms[0].driversList.length, 2);
    assert.equal(restoredRooms[0].roundState, 'playing');
    assert.equal(Object.keys(restoredRooms[0].players).length, 0);
    assert.equal(Object.keys(restoredRooms[0].spectators).length, 0);
    assert.equal(restoredRooms[0].hostId, null);
});

test('persistent room store hydrates compact persisted rooms when it starts', () => {
    const filePath = makeTempFile();
    const driversRepository = createTestDriversRepository();
    const originalStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const room = createRoom('abc123', 'old-socket');

    room.difficulty = 'easy';
    room.targetDriver = testDrivers[1];
    room.driversList = testDrivers;
    room.roundState = 'playing';
    originalStore.set(room.roomId, room);

    const restoredStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const restoredRoom = restoredStore.get('abc123');

    assert.equal(restoredRoom.targetDriver.id, 'verstappen');
    assert.equal(restoredRoom.targetDriver.name, 'Max Verstappen');
    assert.equal(restoredRoom.driversList.length, 2);
});

test('first player joining a restored empty room becomes host', () => {
    const filePath = makeTempFile();
    const driversRepository = createTestDriversRepository();
    const originalStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0, driversRepository });
    const room = createRoom('abc123', 'old-socket');
    originalStore.set(room.roomId, room);

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
