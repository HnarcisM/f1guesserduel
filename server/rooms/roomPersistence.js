const fs = require('fs');
const path = require('path');
const { normalizeRoundHistory } = require('./roundHistoryService');

const ROOM_PERSISTENCE_VERSION = 4;
let tempFileSequence = 0;

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
        matchApplied: Boolean(roundResult.matchApplied),
        historyApplied: Boolean(roundResult.historyApplied),
        historyEntryId: typeof roundResult.historyEntryId === 'string' ? roundResult.historyEntryId : null,
        match: roundResult.match && typeof roundResult.match === 'object' ? { ...roundResult.match } : null,
        target: roundResult.target ? { ...roundResult.target } : null,
        players: Array.isArray(roundResult.players)
            ? roundResult.players.map(player => ({ ...player }))
            : []
    };
}


function cloneMatchState(matchState, bestOf = 3) {
    const normalizedBestOf = [3, 5, 7].includes(Number(bestOf)) ? Number(bestOf) : 3;
    const source = matchState && typeof matchState === 'object' ? matchState : {};
    const status = ['waiting', 'active', 'finished'].includes(source.status) ? source.status : 'waiting';

    return {
        bestOf: normalizedBestOf,
        winsRequired: Math.floor(normalizedBestOf / 2) + 1,
        status,
        roundsPlayed: Number.isSafeInteger(source.roundsPlayed) && source.roundsPlayed >= 0 ? source.roundsPlayed : 0,
        draws: Number.isSafeInteger(source.draws) && source.draws >= 0 ? source.draws : 0,
        winnerUsername: status === 'finished' && typeof source.winnerUsername === 'string'
            ? source.winnerUsername
            : null,
        startedAt: Number.isFinite(source.startedAt) ? source.startedAt : null,
        finishedAt: status === 'finished' && Number.isFinite(source.finishedAt) ? source.finishedAt : null
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

function cloneDriver(driver) {
    if (!driver || typeof driver !== 'object') return null;
    return { ...driver };
}

function getDriverId(driver) {
    if (typeof driver === 'string' && driver.trim()) return driver.trim();
    if (!driver || typeof driver !== 'object') return null;
    return typeof driver.id === 'string' && driver.id.trim() ? driver.id.trim() : null;
}

function resolveDriversFromRepository(driversRepository, difficulty) {
    if (!driversRepository || typeof driversRepository.getDriversByDifficulty !== 'function') return [];
    if (!difficulty) return [];

    try {
        const drivers = driversRepository.getDriversByDifficulty(difficulty);
        return Array.isArray(drivers) ? drivers.map(cloneDriver).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function resolveDriversList(rawRoom, options = {}) {
    const repositoryDrivers = resolveDriversFromRepository(options.driversRepository, rawRoom?.difficulty);
    if (repositoryDrivers.length > 0) return repositoryDrivers;

    if (Array.isArray(rawRoom?.driversList)) {
        return rawRoom.driversList.map(cloneDriver).filter(Boolean);
    }

    return [];
}

function resolveTargetDriver(rawRoom, driversList) {
    const targetDriverId = getDriverId(rawRoom?.targetDriverId) || getDriverId(rawRoom?.targetDriver);
    if (!targetDriverId) return null;

    const targetFromList = driversList.find(driver => getDriverId(driver) === targetDriverId);
    if (targetFromList) return cloneDriver(targetFromList);

    const legacyTarget = cloneDriver(rawRoom?.targetDriver);
    if (legacyTarget) return legacyTarget;

    return { id: targetDriverId };
}

function serializeRoom(room) {
    if (!room || typeof room !== 'object' || !room.roomId) return null;

    return {
        roomId: room.roomId,
        hostId: null,
        players: {},
        spectators: {},
        nextGuestNumber: typeof room.nextGuestNumber === 'number' ? room.nextGuestNumber : 1,
        targetDriverId: getDriverId(room.targetDriver) || getDriverId(room.targetDriverId),
        difficulty: room.difficulty || null,
        timed: Boolean(room.timed),
        timeLimitSeconds: room.timeLimitSeconds,
        lobbyDifficulty: room.lobbyDifficulty || room.difficulty || 'easy',
        lobbyTimed: room.lobbyTimed === true,
        lobbyTimeLimitSeconds: room.lobbyTimeLimitSeconds || room.timeLimitSeconds,
        lobbyBestOf: [3, 5, 7].includes(Number(room.lobbyBestOf ?? room.matchState?.bestOf))
            ? Number(room.lobbyBestOf ?? room.matchState?.bestOf)
            : 3,
        matchState: cloneMatchState(room.matchState, room.lobbyBestOf ?? room.matchState?.bestOf),
        roundStartedAt: typeof room.roundStartedAt === 'number' ? room.roundStartedAt : null,
        roundState: room.roundState || 'waiting',
        roundResult: cloneRoundResult(room.roundResult),
        scoreboard: cloneScoreboard(room.scoreboard),
        roundHistory: normalizeRoundHistory(room.roundHistory),
        isDailyChallenge: Boolean(room.isDailyChallenge),
        dailyDate: room.dailyDate || null,
        dailyChallengeId: room.dailyChallengeId || null,
        inactiveSince: Number.isFinite(room.inactiveSince) ? room.inactiveSince : null
    };
}

function deserializeRoom(rawRoom, options = {}) {
    const room = serializeRoom(rawRoom);
    if (!room) return null;

    const driversList = resolveDriversList(rawRoom, options);

    room.hostId = null;
    room.players = {};
    room.spectators = {};
    room.driversList = driversList;
    room.targetDriver = resolveTargetDriver(rawRoom, driversList);

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

function readPersistedRooms(filePath, options = {}) {
    if (!filePath || !fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];

    const parsed = JSON.parse(raw);
    const rawRooms = Array.isArray(parsed) ? parsed : parsed.rooms;
    if (!Array.isArray(rawRooms)) return [];

    return rawRooms
        .map(rawRoom => deserializeRoom(rawRoom, options))
        .filter(Boolean);
}

async function writePersistedRooms(filePath, rooms) {
    const payload = serializeRooms(rooms);
    tempFileSequence += 1;
    const tempFilePath = `${filePath}.${process.pid}.${tempFileSequence}.tmp`;

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    try {
        await fs.promises.writeFile(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        await fs.promises.rename(tempFilePath, filePath);
    } catch (error) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        throw error;
    }

    return payload.rooms.length;
}

module.exports = {
    ROOM_PERSISTENCE_VERSION,
    serializeRoom,
    serializeRooms,
    deserializeRoom,
    readPersistedRooms,
    writePersistedRooms
};
