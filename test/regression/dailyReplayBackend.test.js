const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../../server/socket/registerSocketHandlers');
const { getDailyDateKey } = require('../../server/game/dailyChallenge');

const DAILY_NOW = new Date('2026-07-01T12:00:00.000Z');

function createFakeIo() {
    const io = {
        middleware: null,
        connectionHandler: null,
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
    return io;
}

function createFakeSocket({ id = 'socket-1', user = { id: 7, username: 'DailyUser' } } = {}) {
    const handlers = new Map();
    const emitted = [];

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
        join() {},
        leave() {},
        trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected socket handler for ${eventName}`);
            return handler(payload);
        },
        emitted(eventName) {
            return emitted.filter(event => event.eventName === eventName);
        }
    };
}

function createDependencies() {
    const targetDriver = {
        id: 'max-verstappen',
        name: 'Max Verstappen',
        nat: 'NED',
        team: ['Red Bull'],
        age: 28,
        debut: 2015,
        wins: 70
    };

    const calls = [];
    const claimedAttempts = new Map();
    const gameService = {
        startDailyChallenge(difficulty, dailyDate) {
            const dailyDateKey = getDailyDateKey(dailyDate);
            calls.push({ difficulty, dailyDate });
            return {
                drivers: [targetDriver],
                difficulty,
                targetDriver,
                dailyDate: dailyDateKey,
                dailyChallengeId: `f1-daily-v1:${dailyDateKey}:${difficulty}`,
                roundStartedAt: 12345,
                timed: false,
                timeLimitSeconds: null,
                isDailyChallenge: true
            };
        }
    };

    return {
        calls,
        dependencies: {
            gameService,
            dailyChallengeNow: () => DAILY_NOW,
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
            },
            roomStore: {
                has: () => false,
                get: () => null,
                set() {},
                remove() {},
                markDirty() {}
            },
            sessionService: null
        },
        targetDriver
    };
}

test('backend atomically blocks replaying the same Daily Challenge for the same user/date/difficulty', async () => {
    const io = createFakeIo();
    const socket = createFakeSocket();
    const { calls, dependencies, targetDriver } = createDependencies();

    registerSocketHandlers(io, dependencies);
    assert.ok(io.connectionHandler, 'Expected registerSocketHandlers to attach a connection handler');
    io.connectionHandler(socket);

    await socket.trigger('startDailyChallenge', { level: 'easy', dailyDate: '2099-01-01' });
    assert.equal(socket.emitted('initDailyChallenge').length, 1);
    assert.equal(socket.emitted('initDailyChallenge')[0].payload.dailyDate, '2026-07-01');

    socket.trigger('submitDailyGuess', targetDriver.id);
    assert.equal(socket.emitted('dailyGuessResult').length, 1);
    assert.equal(socket.emitted('dailyGuessResult')[0].payload.isGameOver, true);

    const secondSocket = createFakeSocket({ id: 'socket-2', user: { id: 7, username: 'DailyUser' } });
    io.connectionHandler(secondSocket);
    await secondSocket.trigger('startDailyChallenge', { level: 'easy', dailyDate: '2099-01-01' });

    assert.equal(calls.length, 2, 'Payload generation may run, but it must not create another Daily session.');
    assert.equal(socket.emitted('initDailyChallenge').length, 1);
    assert.equal(secondSocket.emitted('initDailyChallenge').length, 0);
    assert.equal(secondSocket.emitted('dailyChallengeError').length, 1);
});

test('backend refuses Daily Challenge for unauthenticated sockets', async () => {
    const io = createFakeIo();
    const socket = createFakeSocket({ user: null });
    const { calls, dependencies } = createDependencies();

    registerSocketHandlers(io, dependencies);
    io.connectionHandler(socket);
    await socket.trigger('startDailyChallenge', { level: 'easy' });

    assert.equal(calls.length, 0);
    assert.equal(socket.emitted('initDailyChallenge').length, 0);
    assert.match(socket.emitted('dailyChallengeError')[0].payload, /Autentifică-te/);
});

test('backend stops an active Daily session after its account logs out', async () => {
    const io = createFakeIo();
    const socket = createFakeSocket();
    const { dependencies, targetDriver } = createDependencies();

    registerSocketHandlers(io, dependencies);
    io.connectionHandler(socket);
    await socket.trigger('startDailyChallenge', { level: 'medium' });
    socket.user = null;
    socket.trigger('submitDailyGuess', targetDriver.id);

    assert.equal(socket.emitted('dailyGuessResult').length, 0);
    assert.match(socket.emitted('dailyChallengeError')[0].payload, /necesită autentificarea/);
});
