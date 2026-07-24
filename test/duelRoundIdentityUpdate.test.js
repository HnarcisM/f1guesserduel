const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createRoom,
    addPlayerToRoom,
    getPlayer,
    buildPublicScoreboard
} = require('../server/rooms/roomService');
const { registerDuelRoundSocketHandlers } = require('../server/socket/duelRoundSocketHandlers');

function createSocket(id, user) {
    const emitted = [];
    return {
        id,
        user,
        emitted,
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        }
    };
}

test('Duel round XP refreshes public levels inside the coordinated room mutation', async () => {
    const driver = {
        id: 'VER',
        name: 'Max Verstappen',
        nat: 'Dutch',
        team: ['Red Bull Racing'],
        age: 28,
        debut: 2015,
        wins: 70
    };
    const hostSocket = createSocket('socket-host', {
        id: 7,
        username: 'Narcis',
        email: 'private@example.com',
        avatarKey: 'helmet-blue'
    });
    const rivalSocket = createSocket('socket-rival', {
        id: 8,
        username: 'Rival',
        email: 'rival@example.com',
        avatarKey: 'helmet-green'
    });
    const room = createRoom('identity-round', hostSocket.id, {
        ...hostSocket.user,
        level: 1
    });
    addPlayerToRoom(room, rivalSocket.id, {
        ...rivalSocket.user,
        level: 1
    });
    room.roundState = 'playing';
    room.difficulty = 'easy';
    room.targetDriver = driver;
    room.driversList = [driver];
    room.roundStartedAt = Date.now() - 1_000;
    room.matchState.startedAt = room.roundStartedAt;

    const rival = getPlayer(room, rivalSocket.id);
    rival.finished = true;
    rival.attempts = 2;
    rival.correctGuess = false;
    rival.completedAt = Date.now() - 100;

    const handlers = new Map();
    const roomStateReasons = [];
    const roomStateSnapshots = [];
    const directEmits = [];
    const dirtyRooms = [];
    const roomStore = {
        get(roomId) { return roomId === room.roomId ? room : null; },
        markDirty(roomId) { dirtyRooms.push(roomId); }
    };
    const io = {
        to(target) {
            return {
                emit(eventName, payload) {
                    directEmits.push({ target, eventName, payload });
                }
            };
        }
    };

    registerDuelRoundSocketHandlers({
        io,
        socket: hostSocket,
        state: { currentRoom: room.roomId },
        roomStore,
        gameService: {},
        singleSessions: new Map(),
        accountStatsService: {
            async recordGameResult(result) {
                return {
                    recorded: true,
                    stats: { totals: { played: 1 }, modes: {} },
                    recentGames: [],
                    progress: {
                        level: result.userId === 7 ? 2 : 3,
                        totalXp: result.userId === 7 ? 150 : 300,
                        progressPercent: 0
                    },
                    achievements: [],
                    xpAwarded: 50,
                    reward: null
                };
            }
        },
        logger: { error() {} },
        onSocketEvent(eventName, handler) { handlers.set(eventName, handler); },
        async getActiveRoomSockets() { return [hostSocket, rivalSocket]; },
        async emitGameStateToActiveRoomMembers() {},
        async emitRoomStateUpdate(_roomId, reason) {
            roomStateReasons.push(reason);
            roomStateSnapshots.push({ reason, scoreboard: buildPublicScoreboard(room) });
        },
        async emitRoomListUpdate() {}
    });

    await handlers.get('submitGuess')(driver.id);

    assert.equal(getPlayer(room, hostSocket.id).level, 2);
    assert.equal(getPlayer(room, rivalSocket.id).level, 3);
    assert.equal(directEmits.filter(event => event.eventName === 'accountStatsUpdated').length, 2);
    assert.deepEqual(roomStateReasons, ['round-resolved', 'account-progress-updated']);
    assert.ok(dirtyRooms.length >= 2);

    const roundPayloads = [hostSocket, rivalSocket]
        .flatMap(socket => socket.emitted)
        .filter(event => event.eventName === 'roundResolved')
        .map(event => event.payload);
    assert.equal(roundPayloads.length, 2);
    assert.equal(roundPayloads[0].scoreboard[0].level, 1);
    assert.equal(roomStateSnapshots.at(-1).scoreboard[0].level, 2);
    assert.equal(roomStateSnapshots.at(-1).scoreboard[1].level, 3);
    assert.doesNotMatch(JSON.stringify(roundPayloads), /private@example\.com|rival@example\.com|"userId"/);
});
