const { buildPublicRoomState } = require('../rooms/roomService');
const { buildPublicMemberIdentity } = require('../rooms/memberIdentity');

function getStatusLabel(roundState) {
    if (roundState === 'playing') return 'Rundă activă';
    if (roundState === 'finished') return 'Rundă terminată';
    return 'Lobby';
}

function normalizePublicPlayerPreview(player = {}) {
    const identity = buildPublicMemberIdentity(player, 'Guest');
    return {
        username: identity.username,
        avatarKey: identity.avatarKey,
        isHost: player?.isHost === true,
        connected: player?.connected !== false
    };
}

function normalizeRoomListEntry(room) {
    if (!room || !room.roomId) return null;

    const state = buildPublicRoomState(room);
    const players = Array.isArray(state.players) ? state.players : [];
    const spectators = Array.isArray(state.spectators) ? state.spectators : [];
    const playerCount = Number.isFinite(state.playerCount) ? state.playerCount : players.length;
    const spectatorCount = Number.isFinite(state.spectatorCount) ? state.spectatorCount : spectators.length;
    const maxPlayers = Number.isFinite(state.maxPlayers) ? state.maxPlayers : 2;
    const publicPlayers = players
        .slice()
        .sort((left, right) => Number(right?.isHost === true) - Number(left?.isHost === true))
        .slice(0, maxPlayers)
        .map(normalizePublicPlayerPreview);
    const host = publicPlayers.find(player => player.isHost) || publicPlayers[0] || null;
    const totalCount = playerCount + spectatorCount;
    const bestOf = [3, 5, 7].includes(Number(state.match?.bestOf))
        ? Number(state.match.bestOf)
        : 3;
    const roundsPlayed = Number.isSafeInteger(Number(state.match?.roundsPlayed))
        && Number(state.match.roundsPlayed) >= 0
        ? Number(state.match.roundsPlayed)
        : 0;
    const scoreboard = Array.isArray(state.scoreboard) ? state.scoreboard.slice(0, 2) : [];
    const score = [
        Number.isSafeInteger(Number(scoreboard[0]?.wins)) && Number(scoreboard[0].wins) >= 0
            ? Number(scoreboard[0].wins)
            : 0,
        Number.isSafeInteger(Number(scoreboard[1]?.wins)) && Number(scoreboard[1].wins) >= 0
            ? Number(scoreboard[1].wins)
            : 0
    ];

    if (totalCount <= 0) return null;

    return {
        roomId: state.roomId,
        hostUsername: host?.username || 'Host necunoscut',
        players: publicPlayers,
        playerCount,
        spectatorCount,
        totalCount,
        maxPlayers,
        roundState: state.roundState || 'waiting',
        statusLabel: getStatusLabel(state.roundState),
        lobbySettings: state.lobbySettings || { difficulty: 'easy', timed: false, timeLimitSeconds: 60, bestOf: 3 },
        bestOf,
        roundsPlayed,
        score,
        canJoinAsPlayer: playerCount < maxPlayers,
        canSpectate: playerCount >= maxPlayers
    };
}

function compareRoomListEntries(left, right) {
    const leftIsLobby = left.roundState !== 'playing';
    const rightIsLobby = right.roundState !== 'playing';

    if (leftIsLobby !== rightIsLobby) return leftIsLobby ? -1 : 1;
    if (left.canJoinAsPlayer !== right.canJoinAsPlayer) return left.canJoinAsPlayer ? -1 : 1;
    return String(left.roomId).localeCompare(String(right.roomId));
}

function buildPublicRoomListPayload(roomStore, options = {}) {
    const rooms = typeof roomStore?.values === 'function'
        ? roomStore.values()
        : [];

    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
    const entries = rooms
        .map(normalizeRoomListEntry)
        .filter(Boolean)
        .sort(compareRoomListEntries)
        .slice(0, limit);

    return {
        rooms: entries,
        totalRooms: entries.length,
        generatedAt: Date.now()
    };
}

module.exports = {
    buildPublicRoomListPayload,
    compareRoomListEntries,
    normalizeRoomListEntry,
    normalizePublicPlayerPreview
};
