const {
    DEFAULT_TIME_LIMIT_SECONDS,
    MAX_PLAYERS_PER_ROOM
} = require('../config/constants');

function getPlayerIds(room) {
    return Object.keys(room.players || {});
}

function getSpectatorIds(room) {
    return Object.keys(room.spectators || {});
}

function getPlayerCount(room) {
    return getPlayerIds(room).length;
}

function getSpectatorCount(room) {
    return getSpectatorIds(room).length;
}

function getRoomMemberCount(room) {
    return getPlayerCount(room) + getSpectatorCount(room);
}

function buildGuestUsername(room) {
    if (typeof room.nextGuestNumber !== 'number') {
        room.nextGuestNumber = getRoomMemberCount(room) + 1;
    }

    const guestNumber = room.nextGuestNumber;
    room.nextGuestNumber += 1;
    return `Guest ${guestNumber}`;
}

function createRoomMember(room, socketId, authUser = null, role = 'player') {
    return {
        socketId,
        userId: authUser ? authUser.id : null,
        username: authUser ? authUser.username : buildGuestUsername(room),
        role,
        isHost: role === 'player' && room.hostId === socketId,
        attempts: 0,
        finished: false,
        timedOut: false,
        guesses: [],
        connected: true
    };
}

function createPlayer(room, socketId, authUser = null) {
    return createRoomMember(room, socketId, authUser, 'player');
}

function createSpectator(room, socketId, authUser = null) {
    const spectator = createRoomMember(room, socketId, authUser, 'spectator');
    spectator.isHost = false;
    return spectator;
}

function updateRoomMemberAuth(member, authUser = null) {
    member.connected = true;
    if (authUser) {
        member.userId = authUser.id;
        member.username = authUser.username;
    }
}

function syncHostFlags(room) {
    for (const player of Object.values(room.players || {})) {
        player.role = 'player';
        player.isHost = player.socketId === room.hostId;
    }

    for (const spectator of Object.values(room.spectators || {})) {
        spectator.role = 'spectator';
        spectator.isHost = false;
    }
}

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
        roundState: 'waiting'
    };

    room.players[hostSocketId] = createPlayer(room, hostSocketId, authUser);
    syncHostFlags(room);

    return room;
}

function addPlayerToRoom(room, socketId, authUser = null) {
    if (!room.spectators) room.spectators = {};

    if (room.players[socketId]) {
        updateRoomMemberAuth(room.players[socketId], authUser);
        syncHostFlags(room);
        return { joined: true, role: 'player' };
    }

    if (room.spectators[socketId]) {
        updateRoomMemberAuth(room.spectators[socketId], authUser);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) {
        room.spectators[socketId] = createSpectator(room, socketId, authUser);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    room.players[socketId] = createPlayer(room, socketId, authUser);
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
    if (!room.spectators) room.spectators = {};

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
    if (!room.players) room.players = {};
    if (!room.spectators) room.spectators = {};

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

    if (!room.hostId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    while (removedActivePlayer && getPlayerCount(room) < MAX_PLAYERS_PER_ROOM && getSpectatorCount(room) > 0) {
        const promoted = promoteNextSpectatorToPlayer(room);
        if (!promoted) break;
        changed = true;
    }

    if (!room.hostId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    syncHostFlags(room);
    return changed;
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

function resetPlayersForNewRound(room) {
    for (const player of Object.values(room.players)) {
        player.attempts = 0;
        player.finished = false;
        player.timedOut = false;
        player.guesses = [];
    }
}

function recordPlayerGuess(player, guessDriver, results, isCorrectGuess, isGameOver) {
    if (!player) return null;
    if (!Array.isArray(player.guesses)) player.guesses = [];

    const entry = {
        attempt: player.attempts,
        guess: {
            id: guessDriver.id,
            name: guessDriver.name,
            nat: guessDriver.nat,
            team: Array.isArray(guessDriver.team) ? [...guessDriver.team] : guessDriver.team,
            age: guessDriver.age,
            debut: guessDriver.debut,
            wins: guessDriver.wins
        },
        results,
        isCorrect: Boolean(isCorrectGuess),
        isGameOver: Boolean(isGameOver),
        createdAt: Date.now()
    };

    player.guesses.push(entry);
    return entry;
}

function markPlayerTimedOut(player) {
    if (!player) return;
    player.finished = true;
    player.timedOut = true;
}

function serializeGuessEntry(entry) {
    return {
        attempt: entry.attempt,
        guess: entry.guess,
        results: entry.results,
        isCorrect: entry.isCorrect,
        isGameOver: entry.isGameOver,
        createdAt: entry.createdAt
    };
}

function serializeRoomMember(member) {
    return {
        socketId: member.socketId,
        userId: member.userId,
        username: member.username,
        role: member.role,
        isHost: member.isHost,
        connected: member.connected,
        attempts: typeof member.attempts === 'number' ? member.attempts : 0,
        finished: Boolean(member.finished),
        timedOut: Boolean(member.timedOut),
        guesses: Array.isArray(member.guesses) ? member.guesses.map(serializeGuessEntry) : []
    };
}

function buildLiveBoardState(room) {
    return {
        roundState: room.roundState,
        players: Object.values(room.players || {}).map(serializeRoomMember)
    };
}

function buildPublicRoomState(room) {
    const players = Object.values(room.players || {}).map(serializeRoomMember);
    const spectators = Object.values(room.spectators || {}).map(serializeRoomMember);

    return {
        playerCount: players.length,
        spectatorCount: spectators.length,
        totalCount: players.length + spectators.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        players,
        spectators
    };
}

module.exports = {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    removeInactiveRoomMembers,
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
