function createReconnectStrategy(maxRetries = 3) {
    return retries => {
        if (retries >= maxRetries) {
            return new Error(`Redis connection failed after ${maxRetries} retries.`);
        }
        return Math.min(250 * (2 ** retries), 2000);
    };
}

async function createRedisClient({
    url,
    connectTimeoutMs = 10_000,
    logger = console,
    clientFactory = null
}) {
    if (!url || typeof url !== 'string') {
        throw new Error('REDIS_URL is required to create a Redis client.');
    }

    let factory = clientFactory;
    if (!factory) {
        try {
            ({ createClient: factory } = require('redis'));
        } catch {
            throw new Error("Lipsește dependența 'redis'. Rulează `npm install` înainte de `npm start`.");
        }
    }

    const client = factory({
        url,
        socket: {
            connectTimeout: connectTimeoutMs,
            reconnectStrategy: createReconnectStrategy()
        }
    });

    client.on?.('error', error => {
        logger?.error?.('Redis client error.', { error, provider: 'redis' });
    });

    try {
        await client.connect();
    } catch (error) {
        client.destroy?.();
        throw error;
    }
    logger?.info?.('Redis client connected.', { provider: 'redis' });
    return client;
}

async function closeRedisClient(client) {
    if (!client) return;

    if (client.isOpen && typeof client.quit === 'function') {
        await client.quit();
        return;
    }

    client.destroy?.();
}

module.exports = {
    createReconnectStrategy,
    createRedisClient,
    closeRedisClient
};
