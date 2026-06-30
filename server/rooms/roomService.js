const {
    DEFAULT_TIME_LIMIT_SECONDS,
    MAX_PLAYERS_PER_ROOM
} = require('../config/constants');

function getPlayerIds(room) {
    return Object.keys(room.players || {});
}

function getPlayerCount(room) {
    return getPlayerIds(room).length;
}

function buildGuestUsername(room) {
    return `Guest ${getPlayerCount(room) + 1}`;
}

function createPlayer(room, socketId, authUser = null) {
    return {
        socketId,
        userId: authUser ? authUser.id : null,
        username: authUser ? authUser.username : buildGuestUsername(room),
        isHost: room.hostId === socketId,
        attempts: 0,
        finished: false,
        connected: true
    };
}

function syncHostFlags(room) {
    for (const player of Object.values(room.players)) {
        player.isHost = player.socketId === room.hostId;
    }
}

function createRoom(roomId, hostSocketId, authUser = null) {
    const room = {
        roomId,
        hostId: hostSocketId,
        players: {},
        targetDriver: null,
        difficulty: null,
        driversList: [],
        timed: false,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        roundStartedAt: null,
        roundState: 'waiting'
    };

    room.players[hostSocketId] = createPlayer(room, hostSocketId, authUser);
    syncHostFlags(room);

    return room;
}

function addPlayerToRoom(room, socketId, authUser = null) {
    if (room.players[socketId]) {
        room.players[socketId].connected = true;
        if (authUser) {
            room.players[socketId].userId = authUser.id;
            room.players[socketId].username = authUser.username;
        }
        syncHostFlags(room);
        return true;
    }

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) return false;

    room.players[socketId] = createPlayer(room, socketId, authUser);
    syncHostFlags(room);
    return true;
}

function removePlayerFromRoom(room, socketId) {
    delete room.players[socketId];

    if (room.hostId === socketId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    syncHostFlags(room);
}

function getPlayer(room, socketId) {
    return room.players[socketId] || null;
}

function hasPlayer(room, socketId) {
    return Boolean(getPlayer(room, socketId));
}

function isHost(room, socketId) {
    return room.hostId === socketId;
}

function resetPlayersForNewRound(room) {
    for (const player of Object.values(room.players)) {
        player.attempts = 0;
        player.finished = false;
    }
}

function buildPublicRoomState(room) {
    return {
        playerCount: getPlayerCount(room),
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        players: Object.values(room.players).map(player => ({
            socketId: player.socketId,
            userId: player.userId,
            username: player.username,
            isHost: player.isHost,
            connected: player.connected,
            finished: player.finished
        }))
    };
}

module.exports = {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    getPlayer,
    hasPlayer,
    isHost,
    getPlayerCount,
    resetPlayersForNewRound,
    buildPublicRoomState
};
