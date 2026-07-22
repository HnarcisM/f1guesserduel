const crypto = require('crypto');

const REDIS_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

function hashRateLimitIdentity(value) {
    return crypto
        .createHash('sha256')
        .update(String(value || 'unknown'), 'utf8')
        .digest('hex')
        .slice(0, 32);
}

function getDistributedSocketIdentity(socket) {
    if (socket?.user?.id !== undefined && socket?.user?.id !== null) {
        return `user:${socket.user.id}`;
    }

    const address = socket?.handshake?.address
        || socket?.conn?.remoteAddress
        || socket?.id
        || 'unknown-socket';
    return `anonymous:${address}`;
}

function createRedisRateLimitStore({ redisClient, keyPrefix = 'f1guesserduel', metrics = null }) {
    if (!redisClient || typeof redisClient.eval !== 'function') {
        throw new Error('A connected Redis client is required for Redis rate limiting.');
    }

    return {
        provider: 'redis',
        async consume({ key, maxEvents, windowMs, currentTime = Date.now() }) {
            const redisKey = `${keyPrefix}:rate-limit:${hashRateLimitIdentity(key)}`;
            const consumeLimit = () => redisClient.eval(REDIS_RATE_LIMIT_SCRIPT, {
                keys: [redisKey],
                arguments: [String(windowMs)]
            });
            const result = metrics?.observeDependencyOperation
                ? await metrics.observeDependencyOperation('redis', 'rate_limit', consumeLimit)
                : await consumeLimit();
            const count = Number(result?.[0]);
            const rawTtlMs = Number(result?.[1]);
            if (!Number.isFinite(count) || count < 1 || !Number.isFinite(rawTtlMs)) {
                throw new Error('Redis rate limit script returned an invalid result.');
            }
            const ttlMs = Math.max(1, rawTtlMs || windowMs);

            return {
                allowed: count <= maxEvents,
                remaining: Math.max(0, maxEvents - count),
                retryAfterMs: count <= maxEvents ? 0 : ttlMs,
                resetAt: currentTime + ttlMs
            };
        }
    };
}

module.exports = {
    REDIS_RATE_LIMIT_SCRIPT,
    hashRateLimitIdentity,
    getDistributedSocketIdentity,
    createRedisRateLimitStore
};
