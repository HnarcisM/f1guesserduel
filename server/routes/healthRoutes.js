const CHECK_STATUS_OK = 'ok';
const CHECK_STATUS_ERROR = 'error';

function normalizeCheckResult(result) {
    if (!result || typeof result !== 'object') {
        return { status: CHECK_STATUS_OK };
    }

    const status = result.status === CHECK_STATUS_ERROR ? CHECK_STATUS_ERROR : CHECK_STATUS_OK;
    const normalized = {
        ...result,
        status
    };

    delete normalized.error;
    delete normalized.stack;
    delete normalized.path;
    delete normalized.filePath;

    return normalized;
}

function buildErrorCheckResult() {
    return {
        status: CHECK_STATUS_ERROR,
        message: 'Health check failed.'
    };
}

async function resolveHealthChecks(checks = {}) {
    const resolvedChecks = {};
    const entries = Object.entries(checks || {});

    for (const [name, check] of entries) {
        if (typeof check !== 'function') continue;

        try {
            resolvedChecks[name] = normalizeCheckResult(await check());
        } catch (error) {
            resolvedChecks[name] = buildErrorCheckResult(error);
        }
    }

    return resolvedChecks;
}

function hasFailedChecks(checks = {}) {
    return Object.values(checks).some(check => check?.status === CHECK_STATUS_ERROR);
}

function createHealthChecks({ db = null, redisClient = null, driversRepository = null, roomStore = null } = {}) {
    const checks = {};

    if (db?.check) {
        checks.database = async () => {
            await db.check();
            return { status: CHECK_STATUS_OK };
        };
    } else if (db?.prepare) {
        checks.database = () => {
            db.prepare('SELECT 1 AS ok').get();
            return { status: CHECK_STATUS_OK };
        };
    }

    if (redisClient?.ping) {
        checks.redis = async () => {
            await redisClient.ping();
            return { status: CHECK_STATUS_OK };
        };
    }

    if (driversRepository?.getAllDrivers) {
        checks.drivers = () => {
            const drivers = driversRepository.getAllDrivers();
            return {
                status: Array.isArray(drivers) && drivers.length > 0 ? CHECK_STATUS_OK : CHECK_STATUS_ERROR,
                count: Array.isArray(drivers) ? drivers.length : 0
            };
        };
    }

    if (roomStore?.values) {
        checks.rooms = () => {
            const rooms = roomStore.values();
            const lastSaveError = typeof roomStore.getLastSaveError === 'function'
                ? roomStore.getLastSaveError()
                : null;

            const result = {
                status: lastSaveError ? CHECK_STATUS_ERROR : CHECK_STATUS_OK,
                activeRooms: Array.isArray(rooms) ? rooms.length : 0,
                persistence: lastSaveError ? 'error' : 'ok'
            };
            if (typeof roomStore.provider === 'string') {
                result.provider = roomStore.provider;
            }
            return result;
        };
    }

    return checks;
}

async function createHealthPayload({
    clock = () => new Date(),
    getUptime = () => process.uptime(),
    appVersion = null,
    nodeEnv = null,
    persistenceMode = null,
    databaseProvider = null,
    checks = {}
} = {}) {
    const resolvedChecks = await resolveHealthChecks(checks);
    const status = hasFailedChecks(resolvedChecks) ? 'degraded' : 'ok';
    const payload = {
        status,
        uptimeSeconds: Math.floor(getUptime()),
        timestamp: clock().toISOString()
    };

    if (appVersion) {
        payload.version = appVersion;
    }

    if (nodeEnv) {
        payload.nodeEnv = nodeEnv;
    }

    if (persistenceMode) {
        payload.persistence = {
            mode: persistenceMode
        };
    }

    if (databaseProvider) {
        payload.database = {
            provider: databaseProvider
        };
    }

    if (Object.keys(resolvedChecks).length > 0) {
        payload.checks = resolvedChecks;
    }

    return payload;
}

function createHealthHandler(options = {}) {
    return async (req, res, next) => {
        try {
            const payload = await createHealthPayload(options);
            res.setHeader('Cache-Control', 'no-store');
            res.status(payload.status === 'ok' ? 200 : 503).json(payload);
        } catch (error) {
            next(error);
        }
    };
}

function createHealthRoutes(options = {}) {
    const express = require('express');
    const router = express.Router();

    router.get('/health', createHealthHandler(options));

    return router;
}

module.exports = {
    createHealthPayload,
    createHealthHandler,
    createHealthRoutes,
    createHealthChecks,
    normalizeCheckResult,
    resolveHealthChecks
};
