const {
    DEFAULT_TIME_LIMIT_SECONDS,
    MAX_PLAYERS_PER_ROOM
} = require('../config/constants');
const {
    getPlayerIds,
    getSpectatorIds,
    getPlayerCount,
    getSpectatorCount,
    getRoomMemberCount,
    createPlayer,
    createSpectator,
    updateRoomMemberAuth,
    syncHostFlags,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut
} = require('./memberService');
const {
    buildLiveBoardState,
    buildPublicRoomState
} = require('./liveBoardService');

function createRoom(roomId, hostSocketId, authUser = null) {
    const room = {
        roomId,
        hostId: hostSocketId,
        players: {},
        spectators: {},
        nextGuestNumber: 1,
        targetDriver: null,
        difficulty: null,
        driversList: [],
        timed: false,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        roundStartedAt: null,
        roundState: 'waiting',
        isDailyChallenge: false,
        dailyDate: null,
        dailyChallengeId: null
    };

    room.players[hostSocketId] = createPlayer(room, hostSocketId, authUser);
    syncHostFlags(room);

    return room;
}

function addPlayerToRoom(room, socketId, authUser = null) {
    ensureRoomCollections(room);

    if (room.players[socketId]) {
        updateRoomMemberAuth(room.players[socketId], authUser, room);
        syncHostFlags(room);
        return { joined: true, role: 'player' };
    }

    if (room.spectators[socketId]) {
        updateRoomMemberAuth(room.spectators[socketId], authUser, room);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) {
        room.spectators[socketId] = createSpectator(room, socketId, authUser);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    room.players[socketId] = createPlayer(room, socketId, authUser);
    if (!room.hostId) {
        room.hostId = socketId;
    }
    syncHostFlags(room);
    return { joined: true, role: 'player' };
}

function promoteNextSpectatorToPlayer(room) {
    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) return null;

    const nextSpectatorId = getSpectatorIds(room)[0];
    if (!nextSpectatorId) return null;

    const spectator = room.spectators[nextSpectatorId];
    delete room.spectators[nextSpectatorId];

    spectator.role = 'player';
    spectator.attempts = 0;
    spectator.finished = false;
    spectator.timedOut = false;
    spectator.guesses = [];
    room.players[nextSpectatorId] = spectator;

    if (!room.hostId) {
        room.hostId = nextSpectatorId;
    }

    syncHostFlags(room);
    return spectator;
}

function removePlayerFromRoom(room, socketId) {
    ensureRoomCollections(room);

    const wasPlayer = Boolean(room.players[socketId]);
    delete room.players[socketId];
    delete room.spectators[socketId];

    if (room.hostId === socketId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    if (wasPlayer) {
        promoteNextSpectatorToPlayer(room);
    }

    if (!room.hostId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    syncHostFlags(room);
}

function removeInactiveRoomMembers(room, isSocketActive) {
    if (!room || typeof isSocketActive !== 'function') return false;
    ensureRoomCollections(room);

    let changed = false;
    let removedActivePlayer = false;

    for (const socketId of getPlayerIds(room)) {
        if (!isSocketActive(socketId)) {
            delete room.players[socketId];
            changed = true;
            removedActivePlayer = true;

            if (room.hostId === socketId) {
                room.hostId = null;
            }
        }
    }

    for (const socketId of getSpectatorIds(room)) {
        if (!isSocketActive(socketId)) {
            delete room.spectators[socketId];
            changed = true;
        }
    }

    ensureActiveHost(room);

    while (removedActivePlayer && getPlayerCount(room) < MAX_PLAYERS_PER_ROOM && getSpectatorCount(room) > 0) {
        const promoted = promoteNextSpectatorToPlayer(room);
        if (!promoted) break;
        changed = true;
    }

    ensureActiveHost(room);
    syncHostFlags(room);
    return changed;
}

function refreshRoomMemberAuth(room, socketId, authUser = null) {
    const member = getRoomMember(room, socketId);
    if (!member) return null;

    updateRoomMemberAuth(member, authUser, room);
    syncHostFlags(room);
    return member;
}

function ensureRoomCollections(room) {
    if (!room.players) room.players = {};
    if (!room.spectators) room.spectators = {};
}

function ensureActiveHost(room) {
    if (!room.hostId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }
}

function getPlayer(room, socketId) {
    return room.players[socketId] || null;
}

function getSpectator(room, socketId) {
    return (room.spectators || {})[socketId] || null;
}

function getRoomMember(room, socketId) {
    return getPlayer(room, socketId) || getSpectator(room, socketId);
}

function hasPlayer(room, socketId) {
    return Boolean(getPlayer(room, socketId));
}

function hasRoomMember(room, socketId) {
    return Boolean(getRoomMember(room, socketId));
}

function isHost(room, socketId) {
    return room.hostId === socketId;
}

function isSpectator(room, socketId) {
    return Boolean(getSpectator(room, socketId));
}

module.exports = {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    removeInactiveRoomMembers,
    refreshRoomMemberAuth,
    getPlayer,
    getSpectator,
    getRoomMember,
    hasPlayer,
    hasRoomMember,
    isHost,
    isSpectator,
    getPlayerCount,
    getSpectatorCount,
    getRoomMemberCount,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState,
    buildPublicRoomState
};
