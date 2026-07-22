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
    clock = nowMs,
    store = null,
    failOpen = true,
    logger = console,
    storeErrorLogIntervalMs = 30_000,
    metrics = null
} = {}) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error('Rate limiter windowMs must be a positive number.');
    }

    if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
        throw new Error('Rate limiter maxRequests must be a positive integer.');
    }

    const buckets = new Map();
    let lastStoreErrorLogAt = Number.NEGATIVE_INFINITY;

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

    function consumeFromMemory(key, currentTime = clock()) {
        const bucket = getBucket(key, currentTime);

        if (bucket.count >= maxRequests) {
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
            remaining: Math.max(0, maxRequests - bucket.count),
            retryAfterMs: 0,
            resetAt: bucket.resetAt
        };
    }

    function applyResult(result, res, next, {
        provider = store?.provider || 'memory',
        fallback = false
    } = {}) {
        const resetAt = Number.isFinite(result?.resetAt)
            ? result.resetAt
            : clock() + Math.max(1, Number(result?.retryAfterMs) || windowMs);

        res.setHeader('X-RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, Number(result?.remaining) || 0)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

        metrics?.recordRateLimit?.({
            channel: 'http',
            provider,
            outcome: `${fallback ? 'fallback_' : ''}${result?.allowed ? 'allowed' : 'blocked'}`
        });

        if (!result?.allowed) {
            res.setHeader('Retry-After', formatRetryAfter((result?.retryAfterMs || windowMs) / 1000));
            return res.status(429).json({ message });
        }

        return next();
    }

    function logStoreError(error) {
        const currentTime = clock();
        if (currentTime - lastStoreErrorLogAt < storeErrorLogIntervalMs) return;

        lastStoreErrorLogAt = currentTime;
        logger?.error?.('Redis HTTP rate limit check failed.', {
            error,
            provider: store?.provider || 'external',
            keyPrefix,
            fallback: 'memory'
        });
    }

    function handleStoreError(error, key, res, next) {
        logStoreError(error);
        if (failOpen) {
            return applyResult(consumeFromMemory(key), res, next, {
                provider: 'memory',
                fallback: true
            });
        }
        return applyResult({
            allowed: false,
            remaining: 0,
            retryAfterMs: windowMs,
            resetAt: clock() + windowMs
        }, res, next, {
            provider: store?.provider || 'external',
            fallback: true
        });
    }

    function middleware(req, res, next) {
        const currentTime = clock();
        const key = getKey(req);

        if (!store?.consume) {
            return applyResult(consumeFromMemory(key, currentTime), res, next, { provider: 'memory' });
        }

        let result;
        try {
            result = store.consume({
                key,
                maxEvents: maxRequests,
                windowMs,
                currentTime
            });
        } catch (error) {
            return handleStoreError(error, key, res, next);
        }

        if (!result || typeof result.then !== 'function') {
            return applyResult(result, res, next, { provider: store.provider || 'external' });
        }

        return result.then(
            resolvedResult => applyResult(resolvedResult, res, next, { provider: store.provider || 'external' }),
            error => handleStoreError(error, key, res, next)
        );
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
