const fs = require('fs');
const path = require('path');

const ROOM_PERSISTENCE_VERSION = 1;

function cloneRoundResult(roundResult) {
    if (!roundResult || typeof roundResult !== 'object') return null;

    return {
        status: roundResult.status || null,
        reason: roundResult.reason || null,
        winnerSocketId: null,
        winnerUsername: roundResult.winnerUsername || null,
        resolvedAt: typeof roundResult.resolvedAt === 'number' ? roundResult.resolvedAt : null,
        finishedAt: typeof roundResult.finishedAt === 'number' ? roundResult.finishedAt : null,
        allPlayersFinished: Boolean(roundResult.allPlayersFinished),
        scoreApplied: Boolean(roundResult.scoreApplied),
        target: roundResult.target ? { ...roundResult.target } : null,
        players: Array.isArray(roundResult.players)
            ? roundResult.players.map(player => ({ ...player }))
            : []
    };
}


function cloneScoreboard(scoreboard) {
    if (!scoreboard || typeof scoreboard !== 'object') return {};

    return Object.fromEntries(Object.entries(scoreboard)
        .filter(([, entry]) => entry && typeof entry === 'object')
        .map(([scoreKey, entry]) => [scoreKey, {
            scoreKey: entry.scoreKey || scoreKey,
            username: entry.username || 'Guest',
            wins: typeof entry.wins === 'number' ? entry.wins : 0
        }]));
}

function ensureDirectoryForFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function cloneDriver(driver) {
    if (!driver || typeof driver !== 'object') return null;
    return { ...driver };
}

function serializeRoom(room) {
    if (!room || typeof room !== 'object' || !room.roomId) return null;

    return {
        roomId: room.roomId,
        hostId: null,
        players: {},
        spectators: {},
        nextGuestNumber: typeof room.nextGuestNumber === 'number' ? room.nextGuestNumber : 1,
        targetDriver: cloneDriver(room.targetDriver),
        difficulty: room.difficulty || null,
        driversList: Array.isArray(room.driversList) ? room.driversList.map(cloneDriver).filter(Boolean) : [],
        timed: Boolean(room.timed),
        timeLimitSeconds: room.timeLimitSeconds,
        lobbyDifficulty: room.lobbyDifficulty || room.difficulty || 'easy',
        lobbyTimed: room.lobbyTimed === true,
        lobbyTimeLimitSeconds: room.lobbyTimeLimitSeconds || room.timeLimitSeconds,
        roundStartedAt: typeof room.roundStartedAt === 'number' ? room.roundStartedAt : null,
        roundState: room.roundState || 'waiting',
        roundResult: cloneRoundResult(room.roundResult),
        scoreboard: cloneScoreboard(room.scoreboard),
        isDailyChallenge: Boolean(room.isDailyChallenge),
        dailyDate: room.dailyDate || null,
        dailyChallengeId: room.dailyChallengeId || null
    };
}

function deserializeRoom(rawRoom) {
    const room = serializeRoom(rawRoom);
    if (!room) return null;

    room.hostId = null;
    room.players = {};
    room.spectators = {};
    return room;
}

function serializeRooms(rooms) {
    return {
        version: ROOM_PERSISTENCE_VERSION,
        savedAt: new Date().toISOString(),
        rooms: rooms
            .map(serializeRoom)
            .filter(Boolean)
    };
}

function readPersistedRooms(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];

    const parsed = JSON.parse(raw);
    const rawRooms = Array.isArray(parsed) ? parsed : parsed.rooms;
    if (!Array.isArray(rawRooms)) return [];

    return rawRooms
        .map(deserializeRoom)
        .filter(Boolean);
}

function writePersistedRooms(filePath, rooms) {
    ensureDirectoryForFile(filePath);
    const payload = serializeRooms(rooms);
    const tempFilePath = `${filePath}.tmp`;

    fs.writeFileSync(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tempFilePath, filePath);

    return payload.rooms.length;
}

module.exports = {
    ROOM_PERSISTENCE_VERSION,
    serializeRoom,
    deserializeRoom,
    readPersistedRooms,
    writePersistedRooms
};
