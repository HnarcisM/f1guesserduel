const DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE = 'Prea multe acțiuni într-un timp scurt. Așteaptă câteva secunde și încearcă din nou.';

const DEFAULT_SOCKET_EVENT_LIMITS = Object.freeze({
    requestRoomList: { maxEvents: 60 },
    joinRoom: { maxEvents: 20 },
    updateDuelLobbySettings: { maxEvents: 30 },
    setDifficulty: { maxEvents: 12 },
    submitGuess: { maxEvents: 90 },
    timeExpired: { maxEvents: 12 },
    selectDuelPlayer: { maxEvents: 20 },
    restartGame: { maxEvents: 12 },
    refreshAuthUser: { maxEvents: 30 },
    abortDuelRound: { maxEvents: 10 },
    startSingleGame: { maxEvents: 20 },
    submitSingleGuess: { maxEvents: 90 },
    restartSingleGame: { maxEvents: 20 },
    startDailyChallenge: { maxEvents: 20 },
    submitDailyGuess: { maxEvents: 90 }
});

function nowMs() {
    return Date.now();
}

function normalizeLimit(eventName, limit, fallbackWindowMs) {
    if (!limit || typeof limit !== 'object') {
        throw new Error(`Socket rate limit for ${eventName} must be an object.`);
    }

    const maxEvents = limit.maxEvents;
    const windowMs = limit.windowMs ?? fallbackWindowMs;

    if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
        throw new Error(`Socket rate limit maxEvents for ${eventName} must be a positive integer.`);
    }

    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error(`Socket rate limit windowMs for ${eventName} must be a positive number.`);
    }

    return { maxEvents, windowMs };
}

function normalizeLimits(limits, defaultWindowMs) {
    const normalized = new Map();
    const source = limits && typeof limits === 'object'
        ? limits
        : DEFAULT_SOCKET_EVENT_LIMITS;

    for (const [eventName, limit] of Object.entries(source)) {
        normalized.set(eventName, normalizeLimit(eventName, limit, defaultWindowMs));
    }

    return normalized;
}

function getSocketId(socket) {
    return String(socket?.id || 'unknown-socket');
}

function emitRateLimitError(socket, eventName, result, message) {
    const payload = {
        eventName,
        retryAfterMs: result.retryAfterMs
    };

    socket.emit('socketRateLimited', payload);
    socket.emit('errorMessage', message);

    if (eventName === 'startDailyChallenge') {
        socket.emit('dailyChallengeError', message);
    }
}

function createSocketEventRateLimiter({
    enabled = true,
    limits = DEFAULT_SOCKET_EVENT_LIMITS,
    windowMs = DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
    message = DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE,
    clock = nowMs
} = {}) {
    const normalizedLimits = normalizeLimits(limits, windowMs);
    const buckets = new Map();

    function getLimit(eventName) {
        return normalizedLimits.get(eventName) || null;
    }

    function getBucket(key, currentTime, limit) {
        const existingBucket = buckets.get(key);
        if (existingBucket && existingBucket.resetAt > currentTime) {
            return existingBucket;
        }

        const nextBucket = {
            count: 0,
            resetAt: currentTime + limit.windowMs
        };
        buckets.set(key, nextBucket);
        return nextBucket;
    }

    function cleanup(currentTime = clock()) {
        for (const [key, bucket] of buckets.entries()) {
            if (bucket.resetAt <= currentTime) {
                buckets.delete(key);
            }
        }
    }

    function consume(socket, eventName) {
        if (!enabled) {
            return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };
        }

        const limit = getLimit(eventName);
        if (!limit) {
            return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };
        }

        const currentTime = clock();
        const key = `${getSocketId(socket)}:${eventName}`;
        const bucket = getBucket(key, currentTime, limit);

        if (bucket.count >= limit.maxEvents) {
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: Math.max(1, bucket.resetAt - currentTime),
                resetAt: bucket.resetAt
            };
        }

        bucket.count += 1;
        return {
            allowed: true,
            remaining: Math.max(0, limit.maxEvents - bucket.count),
            retryAfterMs: 0,
            resetAt: bucket.resetAt
        };
    }

    function wrap(socket, eventName, handler) {
        return (...args) => {
            const result = consume(socket, eventName);
            if (!result.allowed) {
                emitRateLimitError(socket, eventName, result, message);
                return undefined;
            }

            return handler(...args);
        };
    }

    function register(socket, eventName, handler) {
        socket.on(eventName, wrap(socket, eventName, handler));
    }

    function clearSocket(socketId) {
        const prefix = `${String(socketId || 'unknown-socket')}:`;
        for (const key of buckets.keys()) {
            if (key.startsWith(prefix)) {
                buckets.delete(key);
            }
        }
    }

    return {
        consume,
        wrap,
        register,
        cleanup,
        clearSocket,
        _getBucketCount(socket, eventName) {
            const bucket = buckets.get(`${getSocketId(socket)}:${eventName}`);
            return bucket ? bucket.count : 0;
        }
    };
}

module.exports = {
    createSocketEventRateLimiter,
    DEFAULT_SOCKET_EVENT_LIMITS,
    DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE
};
