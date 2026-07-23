const test = require('node:test');
const assert = require('node:assert/strict');

const { createRoom, addPlayerToRoom, updateDuelLobbySettings } = require('../server/rooms/roomService');
const { buildPublicRoomListPayload } = require('../server/socket/roomListPayloads');

function createRoomStore(rooms = []) {
    return {
        values() {
            return rooms;
        }
    };
}

test('public room list exposes safe summaries for joinable rooms', () => {
    const room = createRoom('ROOM123', 'socket-host', { id: 1, username: 'Narcis' }, { clientId: 'host-client' });
    updateDuelLobbySettings(room, {
        difficulty: 'medium',
        timed: true,
        timeLimitSeconds: 90,
        bestOf: 3
    });

    const payload = buildPublicRoomListPayload(createRoomStore([room]));

    assert.equal(payload.totalRooms, 1);
    assert.equal(payload.rooms[0].roomId, 'ROOM123');
    assert.equal(payload.rooms[0].hostUsername, 'Narcis');
    assert.equal(payload.rooms[0].playerCount, 1);
    assert.equal(payload.rooms[0].spectatorCount, 0);
    assert.equal(payload.rooms[0].canJoinAsPlayer, true);
    assert.equal(payload.rooms[0].canSpectate, false);
    assert.deepEqual(payload.rooms[0].lobbySettings, {
        difficulty: 'medium',
        timed: true,
        timeLimitSeconds: 90,
        bestOf: 3
    });
    assert.equal(payload.rooms[0].statusLabel, 'Lobby');
    assert.equal('players' in payload.rooms[0], false);
    assert.equal('scoreboard' in payload.rooms[0], false);
});

test('public room list marks full rooms as spectator joins', () => {
    const room = createRoom('FULLROOM', 'socket-host', { id: 1, username: 'Host' }, { clientId: 'host-client' });
    addPlayerToRoom(room, 'socket-2', { id: 2, username: 'Player 2' }, { clientId: 'player-two' });
    addPlayerToRoom(room, 'socket-3', { id: 3, username: 'Viewer' }, { clientId: 'viewer' });

    const payload = buildPublicRoomListPayload(createRoomStore([room]));

    assert.equal(payload.rooms[0].playerCount, 2);
    assert.equal(payload.rooms[0].spectatorCount, 1);
    assert.equal(payload.rooms[0].canJoinAsPlayer, false);
    assert.equal(payload.rooms[0].canSpectate, true);
});

test('public room list hides empty or invalid room entries', () => {
    const payload = buildPublicRoomListPayload(createRoomStore([null, { roomId: 'EMPTY', players: {}, spectators: {} }]));

    assert.equal(payload.totalRooms, 0);
    assert.deepEqual(payload.rooms, []);
});
