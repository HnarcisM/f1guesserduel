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
    const guestUsername = buildGuestUsername(room);

    return {
        socketId,
        userId: authUser ? authUser.id : null,
        username: authUser ? authUser.username : guestUsername,
        guestUsername,
        role,
        isHost: role === 'player' && room.hostId === socketId,
        attempts: 0,
        finished: false,
        timedOut: false,
        correctGuess: false,
        completedAt: null,
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

function updateRoomMemberAuth(member, authUser = null, room = null) {
    member.connected = true;

    if (authUser) {
        member.userId = authUser.id;
        member.username = authUser.username;
        return;
    }

    member.userId = null;
    if (!member.guestUsername) {
        member.guestUsername = room ? buildGuestUsername(room) : 'Guest';
    }
    member.username = member.guestUsername;
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

function resetPlayersForNewRound(room) {
    for (const player of Object.values(room.players || {})) {
        player.attempts = 0;
        player.finished = false;
        player.timedOut = false;
        player.correctGuess = false;
        player.completedAt = null;
        player.guesses = [];
    }
}

function recordPlayerGuess(player, guessDriver, results, isCorrectGuess, isGameOver) {
    if (!player) return null;
    if (!Array.isArray(player.guesses)) player.guesses = [];

    const entry = {
        attempt: player.attempts,
        guess: {
            name: guessDriver.name,
            nat: guessDriver.nat,
            team: Array.isArray(guessDriver.team) ? [...guessDriver.team] : guessDriver.team,
            age: guessDriver.age,
            debut: guessDriver.debut,
            wins: guessDriver.wins
        },
        results,
        isCorrect: Boolean(isCorrectGuess),
        isGameOver: Boolean(isGameOver)
    };

    player.guesses.push(entry);

    if (isGameOver) {
        player.finished = true;
        player.completedAt = Date.now();
        player.correctGuess = Boolean(isCorrectGuess);
    }

    return entry;
}

function markPlayerTimedOut(player) {
    if (!player) return;
    player.finished = true;
    player.timedOut = true;
    player.correctGuess = false;
    player.completedAt = Date.now();
}

module.exports = {
    getPlayerIds,
    getSpectatorIds,
    getPlayerCount,
    getSpectatorCount,
    getRoomMemberCount,
    buildGuestUsername,
    createPlayer,
    createSpectator,
    updateRoomMemberAuth,
    syncHostFlags,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut
};
