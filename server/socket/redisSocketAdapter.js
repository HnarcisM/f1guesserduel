const DEFAULT_ADAPTER_REQUEST_TIMEOUT_MS = 5_000;

function attachRedisClientErrorLogging(client, role, logger = console, metrics = null) {
    client?.on?.('error', error => {
        metrics?.recordDependencyOperation?.({
            dependency: 'redis',
            operation: `socket_adapter_${role}`,
            outcome: 'error'
        });
        logger?.error?.('Socket.IO Redis adapter client error.', {
            error,
            provider: 'redis',
            role
        });
    });
}

async function connectRedisDuplicate(client, role, metrics = null) {
    if (!client || typeof client.connect !== 'function') {
        throw new Error(`Socket.IO Redis adapter requires a ${role} client with connect support.`);
    }
    if (client.isOpen) return client;

    if (metrics?.observeDependencyOperation) {
        await metrics.observeDependencyOperation('redis', `socket_adapter_${role}_connect`, () => client.connect());
    } else {
        await client.connect();
    }
    return client;
}

async function closeRedisDuplicate(client) {
    if (!client) return;
    if (client.isOpen && typeof client.quit === 'function') {
        await client.quit();
        return;
    }
    client.destroy?.();
}

async function createRedisSocketAdapter({
    io,
    redisClient,
    keyPrefix = 'f1guesserduel',
    requestsTimeoutMs = DEFAULT_ADAPTER_REQUEST_TIMEOUT_MS,
    logger = console,
    metrics = null,
    adapterFactory = null
} = {}) {
    if (!io || typeof io.adapter !== 'function') {
        throw new Error('A Socket.IO server instance is required for the Redis adapter.');
    }
    if (!redisClient || typeof redisClient.duplicate !== 'function') {
        throw new Error('A connected Redis client with duplicate support is required for the Socket.IO adapter.');
    }
    if (!Number.isFinite(requestsTimeoutMs) || requestsTimeoutMs <= 0) {
        throw new Error('Socket.IO Redis adapter requestsTimeoutMs must be a positive number.');
    }

    let createAdapter = adapterFactory;
    if (!createAdapter) {
        try {
            ({ createAdapter } = require('@socket.io/redis-adapter'));
        } catch {
            throw new Error("Lipsește dependența '@socket.io/redis-adapter'. Rulează `npm install` înainte de `npm start`.");
        }
    }

    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    attachRedisClientErrorLogging(pubClient, 'publisher', logger, metrics);
    attachRedisClientErrorLogging(subClient, 'subscriber', logger, metrics);

    try {
        await Promise.all([
            connectRedisDuplicate(pubClient, 'publisher', metrics),
            connectRedisDuplicate(subClient, 'subscriber', metrics)
        ]);
        io.adapter(createAdapter(pubClient, subClient, {
            key: `${keyPrefix}:socket.io`,
            requestsTimeout: requestsTimeoutMs,
            publishOnSpecificResponseChannel: true
        }));
    } catch (error) {
        await Promise.allSettled([
            closeRedisDuplicate(pubClient),
            closeRedisDuplicate(subClient)
        ]);
        throw error;
    }

    logger?.info?.('Socket.IO Redis adapter connected.', {
        provider: 'redis',
        channelPrefix: `${keyPrefix}:socket.io`
    });

    let closePromise = null;
    function close() {
        if (!closePromise) {
            closePromise = Promise.allSettled([
                closeRedisDuplicate(pubClient),
                closeRedisDuplicate(subClient)
            ]).then(results => {
                const errors = results
                    .filter(result => result.status === 'rejected')
                    .map(result => result.reason);
                if (errors.length > 0) {
                    throw new AggregateError(errors, 'Failed to close Socket.IO Redis adapter clients.');
                }
            });
        }
        return closePromise;
    }

    return {
        provider: 'redis',
        pubClient,
        subClient,
        close
    };
}

module.exports = {
    createRedisSocketAdapter,
    DEFAULT_ADAPTER_REQUEST_TIMEOUT_MS
};
