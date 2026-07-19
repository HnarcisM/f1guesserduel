const crypto = require('crypto');

const DISCONNECTED_MEMBER_GRACE_MS = 2 * 60 * 1000;

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


function createLobbyMemberId() {
    return `member-${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeClientId(clientId) {
    if (typeof clientId !== 'string') return null;
    const trimmed = clientId.trim();
    if (!trimmed || trimmed.length > 120) return null;
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
    return trimmed;
}

function buildParticipantKey(authUser = null, clientId = null) {
    if (authUser && authUser.id !== undefined && authUser.id !== null) {
        return `user:${authUser.id}`;
    }

    const normalizedClientId = normalizeClientId(clientId);
    return normalizedClientId ? `client:${normalizedClientId}` : null;
}

function createRoomMember(room, socketId, authUser = null, role = 'player', options = {}) {
    const guestUsername = buildGuestUsername(room);
    const clientId = normalizeClientId(options.clientId);
    const participantKey = buildParticipantKey(authUser, clientId);

    return {
        socketId,
        lobbyId: options.lobbyId || createLobbyMemberId(),
        clientId,
        participantKey,
        userId: authUser ? authUser.id : null,
        username: authUser ? authUser.username : guestUsername,
        guestUsername,
        scoreKey: authUser ? `user:${authUser.id}` : `guest:${guestUsername}`,
        role,
        isHost: role === 'player' && room.hostId === socketId,
        attempts: 0,
        finished: false,
        timedOut: false,
        correctGuess: false,
        completedAt: null,
        guesses: [],
        connected: true,
        disconnectedAt: null
    };
}

function createPlayer(room, socketId, authUser = null, options = {}) {
    return createRoomMember(room, socketId, authUser, 'player', options);
}

function createSpectator(room, socketId, authUser = null, options = {}) {
    const spectator = createRoomMember(room, socketId, authUser, 'spectator', options);
    spectator.isHost = false;
    return spectator;
}

function updateRoomMemberAuth(member, authUser = null, room = null) {
    member.connected = true;
    member.disconnectedAt = null;

    if (authUser) {
        member.userId = authUser.id;
        member.username = authUser.username;
        if (!member.participantKey) {
            member.participantKey = buildParticipantKey(authUser, member.clientId);
        }
        return;
    }

    member.userId = null;
    if (!member.guestUsername) {
        member.guestUsername = room ? buildGuestUsername(room) : 'Guest';
    }
    member.username = member.guestUsername;
}

function markRoomMemberDisconnected(member, now = Date.now()) {
    if (!member) return null;
    member.connected = false;
    if (!Number.isFinite(member.disconnectedAt)) member.disconnectedAt = now;
    return member;
}

function reconnectRoomMember(member, socketId, authUser = null, room = null, options = {}) {
    if (!member) return null;
    member.socketId = socketId;
    member.clientId = normalizeClientId(options.clientId) || member.clientId || null;
    if (!member.participantKey) {
        member.participantKey = buildParticipantKey(authUser, member.clientId);
    }
    updateRoomMemberAuth(member, authUser, room);
    member.connected = true;
    member.disconnectedAt = null;
    return member;
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
    DISCONNECTED_MEMBER_GRACE_MS,
    getPlayerIds,
    getSpectatorIds,
    getPlayerCount,
    getSpectatorCount,
    getRoomMemberCount,
    buildGuestUsername,
    normalizeClientId,
    buildParticipantKey,
    createLobbyMemberId,
    createPlayer,
    createSpectator,
    updateRoomMemberAuth,
    markRoomMemberDisconnected,
    reconnectRoomMember,
    syncHostFlags,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut
};
