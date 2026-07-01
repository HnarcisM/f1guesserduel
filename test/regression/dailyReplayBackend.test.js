const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../../server/socket/registerSocketHandlers');

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
    const gameService = {
        startDailyChallenge(difficulty, dailyDate) {
            calls.push({ difficulty, dailyDate });
            return {
                drivers: [targetDriver],
                difficulty,
                targetDriver,
                dailyDate,
                dailyChallengeId: `f1-daily-v1:${dailyDate}:${difficulty}`,
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

test('backend blocks replaying the same completed Daily Challenge for the same user/date/difficulty', () => {
    const io = createFakeIo();
    const socket = createFakeSocket();
    const { calls, dependencies, targetDriver } = createDependencies();

    registerSocketHandlers(io, dependencies);
    assert.ok(io.connectionHandler, 'Expected registerSocketHandlers to attach a connection handler');
    io.connectionHandler(socket);

    socket.trigger('startDailyChallenge', { level: 'easy', dailyDate: '2026-07-01' });
    assert.equal(socket.emitted('initDailyChallenge').length, 1);

    socket.trigger('submitDailyGuess', targetDriver.id);
    assert.equal(socket.emitted('dailyGuessResult').length, 1);
    assert.equal(socket.emitted('dailyGuessResult')[0].payload.isGameOver, true);

    socket.trigger('startDailyChallenge', { level: 'easy', dailyDate: '2026-07-01' });

    assert.equal(
        calls.length,
        1,
        'A completed Daily Challenge must not be started again on the backend for the same owner/date/difficulty.'
    );
    assert.equal(socket.emitted('initDailyChallenge').length, 1);
    assert.equal(socket.emitted('dailyChallengeError').length, 1);
});
