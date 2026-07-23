const DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE = 'Prea multe acțiuni într-un timp scurt. Așteaptă câteva secunde și încearcă din nou.';
const STORE_ERROR_LOG_INTERVAL_MS = 30_000;

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
    requestDailyChallengeStatus: { maxEvents: 30 },
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
    clock = nowMs,
    store = null,
    identityResolver = getSocketId,
    failOpen = true,
    memoryCleanupIntervalMs = null,
    maxMemoryBuckets = 10_000,
    logger = console,
    metrics = null
} = {}) {
    const normalizedLimits = normalizeLimits(limits, windowMs);
    const cleanupIntervalMs = memoryCleanupIntervalMs ?? windowMs;
    if (!Number.isFinite(cleanupIntervalMs) || cleanupIntervalMs <= 0) {
        throw new Error('Socket rate limiter memoryCleanupIntervalMs must be a positive number.');
    }
    if (!Number.isInteger(maxMemoryBuckets) || maxMemoryBuckets <= 0) {
        throw new Error('Socket rate limiter maxMemoryBuckets must be a positive integer.');
    }

    const buckets = new Map();
    let lastStoreErrorLogAt = Number.NEGATIVE_INFINITY;
    let nextCleanupAt = Number.NEGATIVE_INFINITY;

    function getLimit(eventName) {
        return normalizedLimits.get(eventName) || null;
    }

    function getBucket(key, currentTime, limit) {
        const existingBucket = buckets.get(key);
        if (existingBucket && existingBucket.resetAt > currentTime) {
            return existingBucket;
        }

        if (!existingBucket && buckets.size >= maxMemoryBuckets) {
            const oldestKey = buckets.keys().next().value;
            if (oldestKey !== undefined) {
                buckets.delete(oldestKey);
            }
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

    function maybeCleanup(currentTime) {
        if (currentTime < nextCleanupAt || buckets.size === 0) return;

        cleanup(currentTime);
        nextCleanupAt = currentTime + cleanupIntervalMs;
    }

    function consumeFromMemory(socket, eventName, limit, currentTime = clock()) {
        const key = `${identityResolver(socket)}:${eventName}`;
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

    function consume(socket, eventName) {
        if (!enabled) {
            return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };
        }

        const limit = getLimit(eventName);
        if (!limit) {
            return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };
        }

        const currentTime = clock();
        maybeCleanup(currentTime);
        const key = `${identityResolver(socket)}:${eventName}`;

        if (store?.consume) {
            return store.consume({
                key,
                eventName,
                maxEvents: limit.maxEvents,
                windowMs: limit.windowMs,
                currentTime
            });
        }

        return consumeFromMemory(socket, eventName, limit, currentTime);
    }

    function logStoreError(error, eventName) {
        const currentTime = clock();
        if (currentTime - lastStoreErrorLogAt < STORE_ERROR_LOG_INTERVAL_MS) return;

        lastStoreErrorLogAt = currentTime;
        logger?.error?.('Redis socket rate limit check failed.', {
            error,
            eventName,
            provider: store?.provider || 'external',
            fallback: 'memory'
        });
    }

    function wrap(socket, eventName, handler) {
        return (...args) => {
            const result = consume(socket, eventName);

            function handleResult(resolvedResult, {
                provider = store?.provider || 'memory',
                fallback = false
            } = {}) {
                if (enabled && getLimit(eventName)) {
                    metrics?.recordRateLimit?.({
                        channel: 'socket',
                        provider,
                        outcome: `${fallback ? 'fallback_' : ''}${resolvedResult.allowed ? 'allowed' : 'blocked'}`
                    });
                }
                if (!resolvedResult.allowed) {
                    emitRateLimitError(socket, eventName, resolvedResult, message);
                    return undefined;
                }

                return handler(...args);
            }

            if (result && typeof result.then === 'function') {
                return result.then(
                    resolvedResult => handleResult(resolvedResult, { provider: store?.provider || 'external' }),
                    error => {
                        logStoreError(error, eventName);
                        if (failOpen) {
                            const limit = getLimit(eventName);
                            return handleResult(consumeFromMemory(socket, eventName, limit), {
                                provider: 'memory',
                                fallback: true
                            });
                        }

                        metrics?.recordRateLimit?.({
                            channel: 'socket',
                            provider: store?.provider || 'external',
                            outcome: 'fallback_blocked'
                        });
                        emitRateLimitError(socket, eventName, {
                            retryAfterMs: getLimit(eventName)?.windowMs || windowMs
                        }, message);
                        return undefined;
                    }
                );
            }

            return handleResult(result, { provider: store?.provider || 'memory' });
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
            const bucket = buckets.get(`${identityResolver(socket)}:${eventName}`);
            return bucket ? bucket.count : 0;
        },
        _getBucketSize() {
            return buckets.size;
        }
    };
}

module.exports = {
    createSocketEventRateLimiter,
    DEFAULT_SOCKET_EVENT_LIMITS,
    DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_SOCKET_EVENT_RATE_LIMIT_MESSAGE,
    STORE_ERROR_LOG_INTERVAL_MS
};
