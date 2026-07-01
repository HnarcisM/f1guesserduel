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
    markRoomMemberDisconnected,
    reconnectRoomMember,
    buildParticipantKey,
    syncHostFlags,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut
} = require('./memberService');
const {
    buildLiveBoardState,
    buildPublicRoomState
} = require('./liveBoardService');
const {
    buildPersonalRoundResult,
    buildPublicRoundResult,
    resolveRoundWinner
} = require('./roundResultService');
const {
    buildPublicScoreboard,
    ensureMemberScoreEntry,
    resetRoomScoreboard,
    syncScoreboardWithPlayers
} = require('./scoreboardService');

function createRoom(roomId, hostSocketId, authUser = null, options = {}) {
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
        roundResult: null,
        scoreboard: {},
        isDailyChallenge: false,
        dailyDate: null,
        dailyChallengeId: null
    };

    room.players[hostSocketId] = createPlayer(room, hostSocketId, authUser, options);
    ensureMemberScoreEntry(room, room.players[hostSocketId]);
    syncHostFlags(room);

    return room;
}

function findRoomMemberByParticipantKey(room, participantKey) {
    if (!participantKey) return null;

    for (const [socketId, player] of Object.entries(room.players || {})) {
        if (player.participantKey === participantKey) {
            return { member: player, socketId, role: 'player' };
        }
    }

    for (const [socketId, spectator] of Object.entries(room.spectators || {})) {
        if (spectator.participantKey === participantKey) {
            return { member: spectator, socketId, role: 'spectator' };
        }
    }

    return null;
}

function moveRoomMemberSocket(room, existing, newSocketId, authUser = null, options = {}) {
    if (!existing || !existing.member || existing.socketId === newSocketId) return existing?.member || null;

    const collection = existing.role === 'spectator' ? room.spectators : room.players;
    delete collection[existing.socketId];

    reconnectRoomMember(existing.member, newSocketId, authUser, room, options);
    collection[newSocketId] = existing.member;

    if (room.hostId === existing.socketId) {
        room.hostId = newSocketId;
    }

    return existing.member;
}

function addPlayerToRoom(room, socketId, authUser = null, options = {}) {
    ensureRoomCollections(room);
    const participantKey = buildParticipantKey(authUser, options.clientId);

    if (room.players[socketId]) {
        updateRoomMemberAuth(room.players[socketId], authUser, room);
        ensureMemberScoreEntry(room, room.players[socketId]);
        syncHostFlags(room);
        return { joined: true, role: 'player' };
    }

    if (room.spectators[socketId]) {
        updateRoomMemberAuth(room.spectators[socketId], authUser, room);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    const existingMember = findRoomMemberByParticipantKey(room, participantKey);
    if (existingMember) {
        const member = moveRoomMemberSocket(room, existingMember, socketId, authUser, options);
        if (member.role === 'player') ensureMemberScoreEntry(room, member);
        syncHostFlags(room);
        return { joined: true, role: member.role, reconnected: true };
    }

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) {
        room.spectators[socketId] = createSpectator(room, socketId, authUser, options);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    room.players[socketId] = createPlayer(room, socketId, authUser, options);
    ensureMemberScoreEntry(room, room.players[socketId]);
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
    ensureMemberScoreEntry(room, spectator);

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

function shouldRemoveDisconnectedMember(member, now = Date.now()) {
    if (!member) return true;
    if (!member.participantKey) return true;
    if (!member.disconnectedAt) return false;
    const graceMs = 2 * 60 * 1000;
    return now - member.disconnectedAt > graceMs;
}

function removeInactiveRoomMembers(room, isSocketActive) {
    if (!room || typeof isSocketActive !== 'function') return false;
    ensureRoomCollections(room);

    let changed = false;
    let removedActivePlayer = false;
    const now = Date.now();

    for (const socketId of getPlayerIds(room)) {
        if (!isSocketActive(socketId)) {
            const player = room.players[socketId];
            markRoomMemberDisconnected(player, now);

            if (shouldRemoveDisconnectedMember(player, now)) {
                delete room.players[socketId];
                changed = true;
                removedActivePlayer = true;

                if (room.hostId === socketId) {
                    room.hostId = null;
                }
            } else {
                changed = true;
            }
        }
    }

    for (const socketId of getSpectatorIds(room)) {
        if (!isSocketActive(socketId)) {
            const spectator = room.spectators[socketId];
            markRoomMemberDisconnected(spectator, now);

            if (shouldRemoveDisconnectedMember(spectator, now)) {
                delete room.spectators[socketId];
                changed = true;
            } else {
                changed = true;
            }
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

function markRoomMemberDisconnectedBySocketId(room, socketId) {
    const member = getRoomMember(room, socketId);
    if (!member) return null;
    markRoomMemberDisconnected(member);
    syncHostFlags(room);
    return member;
}

function refreshRoomMemberAuth(room, socketId, authUser = null) {
    const member = getRoomMember(room, socketId);
    if (!member) return null;

    updateRoomMemberAuth(member, authUser, room);
    if (member.role === 'player') ensureMemberScoreEntry(room, member);
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

function abortDuelRound(room, reason = 'aborted') {
    if (!room || room.roundState !== 'playing') return null;

    room.targetDriver = null;
    room.driversList = Array.isArray(room.driversList) ? room.driversList : [];
    room.roundStartedAt = null;
    room.roundState = 'waiting';
    room.roundResult = {
        status: 'aborted',
        reason,
        winnerSocketId: null,
        winnerUsername: null,
        resolvedAt: Date.now(),
        finishedAt: Date.now(),
        allPlayersFinished: true,
        scoreApplied: true,
        target: null,
        players: []
    };
    resetPlayersForNewRound(room);
    syncScoreboardWithPlayers(room);

    return buildPublicRoundResult(room.roundResult);
}

module.exports = {
    createRoom,
    addPlayerToRoom,
    findRoomMemberByParticipantKey,
    markRoomMemberDisconnectedBySocketId,
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
    buildPublicScoreboard,
    getPlayerCount,
    getSpectatorCount,
    getRoomMemberCount,
    resetPlayersForNewRound,
    recordPlayerGuess,
    markPlayerTimedOut,
    resetRoomScoreboard,
    syncScoreboardWithPlayers,
    buildLiveBoardState,
    buildPublicRoomState,
    buildPersonalRoundResult,
    buildPublicRoundResult,
    resolveRoundWinner,
    abortDuelRound
};
