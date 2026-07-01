function nowMs() {
    return Date.now();
}

function normalizeIp(value) {
    return String(value || '').trim() || 'unknown-ip';
}

function getRequestIp(req) {
    return normalizeIp(
        req.ip ||
        req.headers?.['x-forwarded-for']?.split(',')?.[0] ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress
    );
}

function formatRetryAfter(seconds) {
    return String(Math.max(1, Math.ceil(seconds)));
}

function createMemoryRateLimiter({
    windowMs,
    maxRequests,
    keyPrefix = 'rate-limit',
    keyGenerator = getRequestIp,
    message = 'Prea multe încercări. Încearcă din nou mai târziu.',
    clock = nowMs
} = {}) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error('Rate limiter windowMs must be a positive number.');
    }

    if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
        throw new Error('Rate limiter maxRequests must be a positive integer.');
    }

    const buckets = new Map();

    function getBucket(key, currentTime) {
        const existingBucket = buckets.get(key);
        if (existingBucket && existingBucket.resetAt > currentTime) {
            return existingBucket;
        }

        const nextBucket = {
            count: 0,
            resetAt: currentTime + windowMs
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

    function getKey(req) {
        return `${keyPrefix}:${keyGenerator(req)}`;
    }

    function middleware(req, res, next) {
        const currentTime = clock();
        const key = getKey(req);
        const bucket = getBucket(key, currentTime);
        const remainingMs = Math.max(0, bucket.resetAt - currentTime);

        res.setHeader('X-RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count - 1)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count >= maxRequests) {
            res.setHeader('Retry-After', formatRetryAfter(remainingMs / 1000));
            return res.status(429).json({ message });
        }

        bucket.count += 1;
        return next();
    }

    middleware.cleanup = cleanup;
    middleware._getBucketCount = (req) => {
        const bucket = buckets.get(getKey(req));
        return bucket ? bucket.count : 0;
    };

    return middleware;
}

module.exports = {
    createMemoryRateLimiter,
    getRequestIp
};
