const {
    DEFAULT_TIME_LIMIT_SECONDS,
    MAX_PLAYERS_PER_ROOM
} = require('../config/constants');

function createRoom(roomId, hostSocketId) {
    return {
        roomId,
        hostId: hostSocketId,
        players: [],
        targetDriver: null,
        difficulty: null,
        driversList: [],
        attempts: {},
        timed: false,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        roundStartedAt: null,
        roundState: 'waiting'
    };
}

function addPlayerToRoom(room, socketId) {
    if (room.players.includes(socketId)) return true;
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return false;

    room.players.push(socketId);
    room.attempts[socketId] = 0;
    return true;
}

function removePlayerFromRoom(room, socketId) {
    room.players = room.players.filter(id => id !== socketId);
    delete room.attempts[socketId];

    if (room.hostId === socketId) {
        room.hostId = room.players[0] || null;
    }
}

function buildPublicRoomState(room) {
    return {
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
    };
}

module.exports = {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    buildPublicRoomState
};
