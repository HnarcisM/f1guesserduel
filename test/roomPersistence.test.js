const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRoom, addPlayerToRoom, getPlayerCount, isHost } = require('../server/rooms/roomService');
const { createPersistentRoomStore } = require('../server/rooms/roomStore.persistent');
const { readPersistedRooms } = require('../server/rooms/roomPersistence');

function makeTempFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-rooms-'));
    return path.join(dir, 'rooms.json');
}

test('persistent room store saves rooms without stale socket members and restores round state', () => {
    const filePath = makeTempFile();
    const store = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0 });
    const room = createRoom('abc123', 'old-socket');

    room.difficulty = 'easy';
    room.targetDriver = { id: 'hamilton', name: 'Lewis Hamilton' };
    room.driversList = [{ id: 'hamilton', name: 'Lewis Hamilton' }];
    room.roundState = 'playing';
    room.roundStartedAt = 12345;

    store.set(room.roomId, room);

    const restoredRooms = readPersistedRooms(filePath);
    assert.equal(restoredRooms.length, 1);
    assert.equal(restoredRooms[0].roomId, 'abc123');
    assert.equal(restoredRooms[0].difficulty, 'easy');
    assert.equal(restoredRooms[0].targetDriver.name, 'Lewis Hamilton');
    assert.equal(restoredRooms[0].roundState, 'playing');
    assert.equal(Object.keys(restoredRooms[0].players).length, 0);
    assert.equal(Object.keys(restoredRooms[0].spectators).length, 0);
    assert.equal(restoredRooms[0].hostId, null);
});

test('first player joining a restored empty room becomes host', () => {
    const filePath = makeTempFile();
    const originalStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0 });
    const room = createRoom('abc123', 'old-socket');
    originalStore.set(room.roomId, room);

    const restoredStore = createPersistentRoomStore({ persistenceFilePath: filePath, saveDebounceMs: 0 });
    const restoredRoom = restoredStore.get('abc123');

    assert.equal(getPlayerCount(restoredRoom), 0);

    addPlayerToRoom(restoredRoom, 'new-socket');

    assert.equal(getPlayerCount(restoredRoom), 1);
    assert.equal(isHost(restoredRoom, 'new-socket'), true);
});
