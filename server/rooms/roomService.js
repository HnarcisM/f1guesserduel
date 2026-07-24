const {
    DEFAULT_TIME_LIMIT_SECONDS,
    MAX_PLAYERS_PER_ROOM,
    normalizeTimeLimitSeconds,
    isValidDifficulty
} = require('../config/constants');
const {
    DISCONNECTED_MEMBER_GRACE_MS,
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
    applyMemberIdentity,
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
const {
    DEFAULT_DUEL_BEST_OF,
    normalizeDuelBestOf,
    createDuelMatchState,
    buildPublicDuelMatch,
    resetDuelMatch,
    updateDuelMatchFormat,
    isDuelMatchFinished
} = require('./duelMatchService');

const DEFAULT_LOBBY_DIFFICULTY = 'easy';

function normalizeDuelLobbySettings(options = {}) {
    const difficulty = isValidDifficulty(options.difficulty) ? options.difficulty : DEFAULT_LOBBY_DIFFICULTY;
    return {
        difficulty,
        timed: options.timed === true,
        timeLimitSeconds: normalizeTimeLimitSeconds(options.timeLimitSeconds),
        bestOf: normalizeDuelBestOf(options.bestOf, DEFAULT_DUEL_BEST_OF)
    };
}

function updateDuelLobbySettings(room, options = {}) {
    if (!room || room.roundState === 'playing') {
        return { changed: false, reason: 'round-active' };
    }

    const nextSettings = normalizeDuelLobbySettings({
        difficulty: options.difficulty || room.lobbyDifficulty || room.difficulty || DEFAULT_LOBBY_DIFFICULTY,
        timed: options.timed === true,
        timeLimitSeconds: options.timeLimitSeconds || room.lobbyTimeLimitSeconds || room.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
        bestOf: options.bestOf ?? room.lobbyBestOf ?? room.matchState?.bestOf ?? DEFAULT_DUEL_BEST_OF
    });

    const difficultyChanged = room.lobbyDifficulty !== nextSettings.difficulty;
    const timerChanged = Boolean(room.lobbyTimed) !== nextSettings.timed
        || Number(room.lobbyTimeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS) !== nextSettings.timeLimitSeconds;
    const formatResult = updateDuelMatchFormat(room, nextSettings.bestOf);

    room.lobbyDifficulty = nextSettings.difficulty;
    room.lobbyTimed = nextSettings.timed;
    room.lobbyTimeLimitSeconds = nextSettings.timeLimitSeconds;
    room.lobbyBestOf = nextSettings.bestOf;

    return {
        changed: difficultyChanged || timerChanged || formatResult.changed,
        matchReset: formatResult.matchReset === true,
        settings: nextSettings
    };
}

function getDuelLobbySettings(room) {
    return normalizeDuelLobbySettings({
        difficulty: room?.lobbyDifficulty || room?.difficulty || DEFAULT_LOBBY_DIFFICULTY,
        timed: room?.lobbyTimed === true,
        timeLimitSeconds: room?.lobbyTimeLimitSeconds || room?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
        bestOf: room?.lobbyBestOf ?? room?.matchState?.bestOf ?? DEFAULT_DUEL_BEST_OF
    });
}

function resetDuelReadyState(room) {
    if (!room) return false;

    let changed = false;
    for (const player of Object.values(room.players || {})) {
        if (player.ready !== false) changed = true;
        player.ready = false;
    }
    return changed;
}

function areDuelPlayersReady(room) {
    const players = Object.values(room?.players || {});
    return players.length === MAX_PLAYERS_PER_ROOM
        && players.every(player => player.connected !== false && player.ready === true);
}

function getDuelReadyStatus(room) {
    const players = Object.values(room?.players || {});
    const connectedPlayers = players.filter(player => player.connected !== false);
    const readyPlayers = connectedPlayers.filter(player => player.ready === true);

    return {
        playerCount: players.length,
        connectedPlayerCount: connectedPlayers.length,
        readyPlayerCount: readyPlayers.length,
        allReady: areDuelPlayersReady(room)
    };
}

function setDuelPlayerReady(room, socketId, ready) {
    if (!room || room.roundState === 'playing') {
        return { changed: false, reason: 'round-active', ready: false, allReady: false };
    }
    if (isDuelMatchFinished(room)) {
        return { changed: false, reason: 'match-finished', ready: false, allReady: false };
    }

    const player = getPlayer(room, socketId);
    if (!player) {
        return { changed: false, reason: 'not-player', ready: false, allReady: false };
    }
    if (player.connected === false) {
        return { changed: false, reason: 'player-disconnected', ready: false, allReady: false };
    }

    const nextReady = ready === true;
    const changed = player.ready !== nextReady;
    player.ready = nextReady;

    return {
        changed,
        ready: nextReady,
        allReady: areDuelPlayersReady(room)
    };
}

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
        lobbyDifficulty: DEFAULT_LOBBY_DIFFICULTY,
        lobbyTimed: false,
        lobbyTimeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        lobbyBestOf: DEFAULT_DUEL_BEST_OF,
        matchState: createDuelMatchState(DEFAULT_DUEL_BEST_OF),
        roundStartedAt: null,
        roundState: 'waiting',
        roundResult: null,
        scoreboard: {},
        roundHistory: [],
        isDailyChallenge: false,
        dailyDate: null,
        dailyChallengeId: null,
        inactiveSince: null
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


function findRoomMemberByLobbyId(room, lobbyId) {
    if (!room || typeof lobbyId !== 'string' || !lobbyId.trim()) return null;
    const normalizedLobbyId = lobbyId.trim();

    for (const [socketId, player] of Object.entries(room.players || {})) {
        if (player.lobbyId === normalizedLobbyId) {
            return { member: player, socketId, role: 'player' };
        }
    }

    for (const [socketId, spectator] of Object.entries(room.spectators || {})) {
        if (spectator.lobbyId === normalizedLobbyId) {
            return { member: spectator, socketId, role: 'spectator' };
        }
    }

    return null;
}

function resetMemberRoundProgress(member) {
    if (!member) return;
    member.attempts = 0;
    member.finished = false;
    member.timedOut = false;
    member.correctGuess = false;
    member.completedAt = null;
    member.guesses = [];
    member.ready = false;
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
        const disconnectedAt = existingMember.member.disconnectedAt;
        const member = moveRoomMemberSocket(room, existingMember, socketId, authUser, options);
        if (member.role === 'player') {
            ensureMemberScoreEntry(room, member);
            resetDuelReadyState(room);
        }
        syncHostFlags(room);
        options.onReconnect?.({
            role: member.role,
            durationMs: Number.isFinite(disconnectedAt)
                ? Math.max(0, Date.now() - disconnectedAt)
                : null
        });
        return { joined: true, role: member.role, reconnected: true };
    }

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM) {
        room.spectators[socketId] = createSpectator(room, socketId, authUser, options);
        syncHostFlags(room);
        return { joined: true, role: 'spectator' };
    }

    room.players[socketId] = createPlayer(room, socketId, authUser, options);
    ensureMemberScoreEntry(room, room.players[socketId]);
    resetDuelReadyState(room);
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
    spectator.ready = false;
    room.players[nextSpectatorId] = spectator;
    ensureMemberScoreEntry(room, spectator);

    if (!room.hostId) {
        room.hostId = nextSpectatorId;
    }

    syncHostFlags(room);
    return spectator;
}


function selectSpectatorAsPlayer(room, spectatorLobbyId) {
    if (!room || room.roundState === 'playing') {
        return { changed: false, reason: 'round-active' };
    }

    ensureRoomCollections(room);

    const target = findRoomMemberByLobbyId(room, spectatorLobbyId);
    if (!target) {
        return { changed: false, reason: 'member-not-found' };
    }

    if (target.role === 'player') {
        return { changed: false, reason: 'already-player' };
    }

    if (target.member.connected === false) {
        return { changed: false, reason: 'member-disconnected' };
    }

    const spectatorSocketId = target.socketId;
    const selectedSpectator = target.member;
    const nonHostPlayerSocketId = getPlayerIds(room).find(playerSocketId => playerSocketId !== room.hostId) || null;

    delete room.spectators[spectatorSocketId];

    if (getPlayerCount(room) >= MAX_PLAYERS_PER_ROOM && nonHostPlayerSocketId) {
        const previousPlayer = room.players[nonHostPlayerSocketId];
        delete room.players[nonHostPlayerSocketId];
        previousPlayer.role = 'spectator';
        previousPlayer.isHost = false;
        resetMemberRoundProgress(previousPlayer);
        room.spectators[nonHostPlayerSocketId] = previousPlayer;
    }

    selectedSpectator.role = 'player';
    resetMemberRoundProgress(selectedSpectator);
    room.players[spectatorSocketId] = selectedSpectator;

    if (!room.hostId) {
        room.hostId = spectatorSocketId;
    }

    room.roundState = 'waiting';
    room.roundResult = null;
    room.targetDriver = null;
    room.roundStartedAt = null;
    resetPlayersForNewRound(room);
    resetDuelMatch(room);
    syncScoreboardWithPlayers(room);
    syncHostFlags(room);

    return { changed: true, selectedSocketId: spectatorSocketId, replacedSocketId: nonHostPlayerSocketId };
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
        resetDuelReadyState(room);
        resetDuelMatch(room);
        syncScoreboardWithPlayers(room);
    }

    if (!room.hostId) {
        room.hostId = getPlayerIds(room)[0] || null;
    }

    syncHostFlags(room);
}

function shouldRemoveDisconnectedMember(member, now = Date.now()) {
    if (!member) return true;
    if (!member.participantKey) return true;
    if (!Number.isFinite(member.disconnectedAt)) return false;
    return now - member.disconnectedAt > DISCONNECTED_MEMBER_GRACE_MS;
}

function removeInactiveRoomMembers(room, isSocketActive, now = Date.now(), options = {}) {
    if (!room || typeof isSocketActive !== 'function') return false;
    ensureRoomCollections(room);

    let changed = false;
    let removedActivePlayer = false;

    for (const socketId of getPlayerIds(room)) {
        if (!isSocketActive(socketId)) {
            const player = room.players[socketId];
            const wasAlreadyDisconnected = player.connected === false
                && Number.isFinite(player.disconnectedAt);
            markRoomMemberDisconnected(player, now);
            if (!wasAlreadyDisconnected) changed = true;

            if (shouldRemoveDisconnectedMember(player, now)) {
                options.onMemberExpired?.({
                    role: 'player',
                    durationMs: Number.isFinite(player.disconnectedAt)
                        ? Math.max(0, now - player.disconnectedAt)
                        : null
                });
                delete room.players[socketId];
                changed = true;
                removedActivePlayer = true;

                if (room.hostId === socketId) {
                    room.hostId = null;
                }
            }
        }
    }

    for (const socketId of getSpectatorIds(room)) {
        if (!isSocketActive(socketId)) {
            const spectator = room.spectators[socketId];
            const wasAlreadyDisconnected = spectator.connected === false
                && Number.isFinite(spectator.disconnectedAt);
            markRoomMemberDisconnected(spectator, now);
            if (!wasAlreadyDisconnected) changed = true;

            if (shouldRemoveDisconnectedMember(spectator, now)) {
                options.onMemberExpired?.({
                    role: 'spectator',
                    durationMs: Number.isFinite(spectator.disconnectedAt)
                        ? Math.max(0, now - spectator.disconnectedAt)
                        : null
                });
                delete room.spectators[socketId];
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

    if (removedActivePlayer) {
        resetDuelMatch(room);
        syncScoreboardWithPlayers(room);
        resetDuelReadyState(room);
    }

    ensureActiveHost(room);
    syncHostFlags(room);
    return changed;
}

function markRoomMemberDisconnectedBySocketId(room, socketId) {
    const member = getRoomMember(room, socketId);
    if (!member) return null;
    markRoomMemberDisconnected(member);
    if (member.role === 'player') resetDuelReadyState(room);
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
    findRoomMemberByLobbyId,
    markRoomMemberDisconnectedBySocketId,
    selectSpectatorAsPlayer,
    updateDuelLobbySettings,
    getDuelLobbySettings,
    buildPublicDuelMatch,
    resetDuelMatch,
    isDuelMatchFinished,
    resetDuelReadyState,
    areDuelPlayersReady,
    getDuelReadyStatus,
    setDuelPlayerReady,
    removePlayerFromRoom,
    removeInactiveRoomMembers,
    refreshRoomMemberAuth,
    applyMemberIdentity,
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
