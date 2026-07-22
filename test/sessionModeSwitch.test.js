const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');
const { getDailyDateKey } = require('../server/game/dailyChallenge');

function createFakeIo(socket) {
    return {
        middleware: null,
        connectionHandler: null,
        sockets: {
            sockets: new Map(socket ? [[socket.id, socket]] : [])
        },
        use(fn) {
            this.middleware = fn;
        },
        on(eventName, handler) {
            if (eventName === 'connection') this.connectionHandler = handler;
        },
        to() {
            return { emit() {} };
        }
    };
}

function createFakeSocket({ id = 'socket-1', user = { id: 'user-1', username: 'ModeUser' } } = {}) {
    const handlers = new Map();
    const emitted = [];
    const joinedRooms = new Set();

    return {
        id,
        user,
        handshake: { headers: { cookie: '' } },
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        join(roomId) {
            joinedRooms.add(roomId);
        },
        leave(roomId) {
            joinedRooms.delete(roomId);
        },
        trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected socket handler for ${eventName}`);
            return handler(payload);
        },
        emitted(eventName) {
            return emitted.filter(event => event.eventName === eventName);
        },
        clearEmitted() {
            emitted.length = 0;
        },
        hasJoined(roomId) {
            return joinedRooms.has(roomId);
        }
    };
}

function createRoomStore() {
    const rooms = new Map();
    return {
        has(roomId) {
            return rooms.has(roomId);
        },
        get(roomId) {
            return rooms.get(roomId) || null;
        },
        set(roomId, room) {
            rooms.set(roomId, room);
        },
        remove(roomId) {
            rooms.delete(roomId);
        },
        markDirty() {},
        rooms
    };
}

function buildDriver(id, name) {
    return {
        id,
        name,
        nat: 'British',
        team: ['McLaren'],
        age: 25,
        debut: 2020,
        wins: 1
    };
}

function createDependencies() {
    const singleTarget = buildDriver('single-target', 'Single Target');
    const dailyTarget = buildDriver('daily-target', 'Daily Target');
    const roomStore = createRoomStore();
    const claimedAttempts = new Map();

    return {
        roomStore,
        dependencies: {
            roomStore,
            sessionService: null,
            gameService: {
                startSingleRound(options) {
                    return {
                        drivers: [singleTarget],
                        difficulty: options.difficulty,
                        targetDriver: singleTarget,
                        timed: false,
                        timeLimitSeconds: 60,
                        roundStartedAt: 1000,
                        isSinglePlay: true
                    };
                },
                restartSingleRound() {
                    return null;
                },
                startDailyChallenge(difficulty, date) {
                    const dailyDate = getDailyDateKey(date);
                    return {
                        drivers: [dailyTarget],
                        difficulty,
                        targetDriver: dailyTarget,
                        dailyDate,
                        dailyChallengeId: `daily:${dailyDate}:${difficulty}`,
                        timed: false,
                        timeLimitSeconds: null,
                        roundStartedAt: 2000,
                        isDailyChallenge: true
                    };
                },
                startNewRound() {
                    return null;
                },
                restartRound() {
                    return null;
                }
            },
            dailyChallengeNow: () => new Date('2026-07-03T12:00:00.000Z'),
            accountStatsService: {
                async claimDailyChallenge(attempt) {
                    const key = `${attempt.userId}:${attempt.challengeId}`;
                    if (claimedAttempts.has(key)) return false;
                    claimedAttempts.set(key, { ...attempt });
                    return true;
                },
                async getDailyChallengeStatus(userId, dailyDate) {
                    return {
                        dailyDate,
                        claimedDifficulties: [...claimedAttempts.values()]
                            .filter(attempt => attempt.userId === userId && attempt.dailyDate === dailyDate)
                            .map(attempt => attempt.difficulty)
                    };
                },
                async recordGameResult() {
                    return { recorded: true };
                }
            }
        },
        singleTarget,
        dailyTarget
    };
}

function setupConnectedSocket() {
    const socket = createFakeSocket();
    const io = createFakeIo(socket);
    const context = createDependencies();

    registerSocketHandlers(io, context.dependencies);
    assert.ok(io.connectionHandler, 'Expected registerSocketHandlers to attach a connection handler');
    io.connectionHandler(socket);

    return { socket, ...context };
}

test('starting Daily Challenge clears the stale Single session for the same socket', async () => {
    const { socket, singleTarget } = setupConnectedSocket();

    socket.trigger('startSingleGame', { level: 'easy' });
    assert.equal(socket.emitted('initGame').length, 1);

    await socket.trigger('startDailyChallenge', { level: 'easy', dailyDate: '2099-01-01' });
    assert.equal(socket.emitted('initDailyChallenge').length, 1);

    socket.clearEmitted();
    socket.trigger('submitSingleGuess', singleTarget.id);

    assert.equal(
        socket.emitted('guessResult').length,
        0,
        'Single guesses from a previous mode must be ignored after switching to Daily Challenge.'
    );
});

test('joining a Duel room clears stale Single and Daily sessions for the same socket', async () => {
    const { socket, singleTarget, dailyTarget } = setupConnectedSocket();

    socket.trigger('startSingleGame', { level: 'easy' });
    await socket.trigger('startDailyChallenge', { level: 'easy' });
    socket.trigger('joinRoom', { roomId: 'abc123', clientId: 'browser-one' });

    assert.equal(socket.hasJoined('abc123'), true);

    socket.clearEmitted();
    socket.trigger('submitSingleGuess', singleTarget.id);
    socket.trigger('submitDailyGuess', dailyTarget.id);

    assert.equal(socket.emitted('guessResult').length, 0);
    assert.equal(socket.emitted('dailyGuessResult').length, 0);
});
