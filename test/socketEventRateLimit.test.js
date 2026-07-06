const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');
const {
    createSocketEventRateLimiter,
    DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE
} = require('../server/socket/socketEventRateLimit');

function createFakeSocket(id = 'socket-1') {
    const handlers = new Map();
    const emitted = [];

    return {
        id,
        handshake: { headers: { cookie: '' } },
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        trigger(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.ok(handler, `Expected handler for ${eventName}`);
            return handler(payload);
        },
        emitted(eventName) {
            return emitted.filter(event => event.eventName === eventName);
        },
        clearEmitted() {
            emitted.length = 0;
        }
    };
}

function createFakeIo() {
    return {
        middleware: null,
        connectionHandler: null,
        sockets: { sockets: new Map() },
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

function createDependencies({ roomStore, socketRateLimit, singleRoundCounter } = {}) {
    const targetDriver = {
        id: 'driver-1',
        name: 'Driver One',
        nat: 'British',
        team: ['McLaren'],
        age: 25,
        debut: 2020,
        wins: 1
    };

    return {
        roomStore: roomStore || createRoomStore(),
        sessionService: null,
        socketRateLimit,
        gameService: {
            startSingleRound(options) {
                if (singleRoundCounter) singleRoundCounter.count += 1;
                return {
                    drivers: [targetDriver],
                    difficulty: options.difficulty,
                    targetDriver,
                    timed: false,
                    timeLimitSeconds: 60,
                    roundStartedAt: 1000
                };
            },
            restartSingleRound() {
                return null;
            },
            startDailyChallenge() {
                return null;
            },
            startNewRound() {
                return null;
            },
            restartRound() {
                return null;
            }
        }
    };
}

test('socket event limiter allows events up to the configured limit', () => {
    let currentTime = 1000;
    const socket = createFakeSocket();
    const limiter = createSocketEventRateLimiter({
        clock: () => currentTime,
        limits: { submitGuess: { maxEvents: 2, windowMs: 60_000 } }
    });

    assert.equal(limiter.consume(socket, 'submitGuess').allowed, true);
    assert.equal(limiter.consume(socket, 'submitGuess').allowed, true);
    assert.equal(limiter._getBucketCount(socket, 'submitGuess'), 2);
});

test('socket event limiter blocks events after the configured limit and resets after the window', () => {
    let currentTime = 1000;
    const socket = createFakeSocket();
    const limiter = createSocketEventRateLimiter({
        clock: () => currentTime,
        limits: { startSingleGame: { maxEvents: 1, windowMs: 10_000 } }
    });

    assert.equal(limiter.consume(socket, 'startSingleGame').allowed, true);
    const blocked = limiter.consume(socket, 'startSingleGame');

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterMs, 10_000);

    currentTime += 10_001;
    assert.equal(limiter.consume(socket, 'startSingleGame').allowed, true);
});

test('socket event limiter wraps handlers and emits a safe rate limit payload', () => {
    let currentTime = 1000;
    const socket = createFakeSocket();
    const limiter = createSocketEventRateLimiter({
        clock: () => currentTime,
        limits: { startDailyChallenge: { maxEvents: 1, windowMs: 60_000 } }
    });
    let handlerCalls = 0;

    socket.on('startDailyChallenge', limiter.wrap(socket, 'startDailyChallenge', () => {
        handlerCalls += 1;
    }));

    socket.trigger('startDailyChallenge');
    socket.trigger('startDailyChallenge');

    assert.equal(handlerCalls, 1);
    assert.deepEqual(socket.emitted('socketRateLimited')[0].payload, {
        eventName: 'startDailyChallenge',
        retryAfterMs: 60_000
    });
    assert.equal(socket.emitted('errorMessage')[0].payload, DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE);
    assert.equal(socket.emitted('dailyChallengeError')[0].payload, DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE);
});

test('socket event limiter can be disabled for tests or trusted deployments', () => {
    const socket = createFakeSocket();
    const limiter = createSocketEventRateLimiter({
        enabled: false,
        limits: { submitGuess: { maxEvents: 1, windowMs: 60_000 } }
    });

    assert.equal(limiter.consume(socket, 'submitGuess').allowed, true);
    assert.equal(limiter.consume(socket, 'submitGuess').allowed, true);
    assert.equal(limiter.consume(socket, 'submitGuess').allowed, true);
});

test('socket event limiter clears socket buckets on disconnect cleanup', () => {
    const socket = createFakeSocket('socket-cleanup');
    const limiter = createSocketEventRateLimiter({
        limits: { submitGuess: { maxEvents: 10, windowMs: 60_000 } }
    });

    limiter.consume(socket, 'submitGuess');
    assert.equal(limiter._getBucketCount(socket, 'submitGuess'), 1);

    limiter.clearSocket(socket.id);
    assert.equal(limiter._getBucketCount(socket, 'submitGuess'), 0);
});

test('registerSocketHandlers rate limits protected game events before executing handlers', () => {
    const io = createFakeIo();
    const socket = createFakeSocket('socket-game');
    const singleRoundCounter = { count: 0 };
    const dependencies = createDependencies({
        singleRoundCounter,
        socketRateLimit: {
            limits: { startSingleGame: { maxEvents: 1, windowMs: 60_000 } },
            clock: () => 1000
        }
    });

    registerSocketHandlers(io, dependencies);
    io.connectionHandler(socket);

    socket.trigger('startSingleGame', { level: 'easy' });
    socket.trigger('startSingleGame', { level: 'easy' });

    assert.equal(singleRoundCounter.count, 1);
    assert.equal(socket.emitted('initGame').length, 1);
    assert.equal(socket.emitted('socketRateLimited').length, 1);
    assert.equal(socket.emitted('socketRateLimited')[0].payload.eventName, 'startSingleGame');
});

test('registerSocketHandlers rate limits room joins without creating extra rooms', () => {
    const io = createFakeIo();
    const socket = createFakeSocket('socket-room');
    socket.user = { id: 'user-room', username: 'Room User' };
    socket.join = () => {};
    socket.leave = () => {};

    const roomStore = createRoomStore();
    const dependencies = createDependencies({
        roomStore,
        socketRateLimit: {
            limits: { joinRoom: { maxEvents: 1, windowMs: 60_000 } },
            clock: () => 1000
        }
    });

    registerSocketHandlers(io, dependencies);
    io.connectionHandler(socket);

    socket.trigger('joinRoom', { roomId: 'room-one', clientId: 'browser-one' });
    socket.trigger('joinRoom', { roomId: 'room-two', clientId: 'browser-one' });

    assert.equal(roomStore.has('room-one'), true);
    assert.equal(roomStore.has('room-two'), false);
    assert.equal(socket.emitted('socketRateLimited').length, 1);
    assert.equal(socket.emitted('socketRateLimited')[0].payload.eventName, 'joinRoom');
});
