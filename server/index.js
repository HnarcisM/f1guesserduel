const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const { createDriversRepository } = require('./data/driversRepository');
const { createGameService } = require('./game/gameService');
const { createPersistentRoomStore } = require('./rooms/roomStore.persistent');
const { createRedisRoomStore } = require('./rooms/roomStore.redis');
const { createRoomCleanupService } = require('./rooms/roomCleanupService');
const { registerSocketHandlers } = require('./socket/registerSocketHandlers');
const { createSocketServerOptions } = require('./socket/socketServerOptions');
const { createRedisSocketAdapter } = require('./socket/redisSocketAdapter');
const { createDatabase } = require('./db/database');
const { createRedisClient, closeRedisClient } = require('./redis/redisClient');
const { createSessionService } = require('./auth/sessionService');
const { createAuthService } = require('./auth/authService');
const { createAuthRoutes } = require('./auth/authRoutes');
const { createAccountStatsService } = require('./account/accountStatsService');
const { createGameHistoryCleanupService } = require('./account/gameHistoryCleanupService');
const { createAccountRoutes } = require('./account/accountRoutes');
const { createAdminAccess } = require('./admin/adminAccess');
const { createAdminService } = require('./admin/adminService');
const { createAdminAuditCleanupService } = require('./admin/adminAuditCleanupService');
const { createAdminRoutes } = require('./admin/adminRoutes');
const { createAdminPageRoutes } = require('./admin/adminPageRoutes');
const { createAdminLoginNotifier } = require('./admin/adminLoginNotifier');
const { createRuntimeSettingsService } = require('./runtime/runtimeSettingsService');
const { createRuntimeSettingsRoutes } = require('./routes/runtimeSettingsRoutes');
const {
    createApiRequestContextMiddleware
} = require('./middleware/apiRequestContext');
const { createErrorMiddleware } = require('./middleware/errorMiddleware');
const { createServerErrorHandler } = require('./middleware/serverErrorHandler');
const { createHealthRoutes, createHealthChecks } = require('./routes/healthRoutes');
const { createMetricsRoutes } = require('./routes/metricsRoutes');
const { createOperationalMetrics } = require('./metrics/operationalMetrics');
const { createSecurityHeadersMiddleware } = require('./middleware/securityHeaders');
const { createRequestLoggingMiddleware } = require('./middleware/requestLogging');
const { createResponseCompressionMiddleware } = require('./middleware/responseCompression');
const { createCsrfProtectionMiddleware } = require('./middleware/csrfProtection');
const { setStaticCacheHeaders } = require('./middleware/staticCacheHeaders');
const {
    createRedisRateLimitStore,
    getDistributedSocketIdentity
} = require('./socket/redisRateLimitStore');
const { createLogger } = require('./logger');
const { registerProcessErrorHandlers } = require('./runtime/processErrorHandlers');
const { createAppConfig } = require('./config/appConfig');
const packageJson = require('../package.json');

const config = createAppConfig(process.env, {
    projectRoot: path.join(__dirname, '..')
});
const logger = createLogger({
    isProduction: config.isProduction,
    level: config.logging.level
});
const operationalMetrics = createOperationalMetrics({
    enabled: config.metrics.enabled,
    includeProcessMetrics: config.metrics.includeProcessMetrics
});

function logPersistenceMode(currentConfig) {
    const databaseProvider = currentConfig.database?.provider || 'sqlite';

    if (currentConfig.persistence?.isEphemeral) {
        logger.warn(databaseProvider === 'postgres'
            ? 'Rulează cu rooms.json efemer și conturi persistente în Postgres. Camerele active pot fi pierdute la restart/redeploy/sleep.'
            : 'Rulează în mod ephemeral/demo. Datele SQLite și rooms.json pot fi pierdute la restart/redeploy/sleep pe hosting free.', {
            persistenceMode: currentConfig.persistence.mode,
            databaseProvider,
            dataDir: currentConfig.dataDir
        });
        return;
    }

    if (currentConfig.isProduction) {
        logger.info('Persistence mode resolved.', {
            persistenceMode: currentConfig.persistence?.mode || 'unknown',
            databaseProvider,
            dataDir: currentConfig.dataDir
        });
    }
}

logPersistenceMode(config);

async function startServer() {
const app = express();
if (config.trustProxy) {
    app.set('trust proxy', 1);
}
const server = http.createServer(app);
const io = new Server(server, createSocketServerOptions({
    allowedOrigins: config.socket.allowedOrigins
}));

const driversRepository = createDriversRepository({
    driversFilePath: config.driversFilePath
});
const gameService = createGameService(driversRepository);
const db = await createDatabase({
    provider: config.database.provider,
    databaseUrl: config.database.url,
    postgresSsl: config.database.postgresSsl,
    maxConnections: config.database.pool.maxConnections,
    connectionTimeoutMs: config.database.pool.connectionTimeoutMs,
    idleTimeoutMs: config.database.pool.idleTimeoutMs,
    queryTimeoutMs: config.database.pool.queryTimeoutMs,
    initializationRetryAttempts: config.database.pool.initializationRetryAttempts,
    initializationRetryBaseDelayMs: config.database.pool.initializationRetryBaseDelayMs,
    keepAliveInitialDelayMs: config.database.pool.keepAliveInitialDelayMs,
    maxLifetimeSeconds: config.database.pool.maxLifetimeSeconds,
    dbFilePath: config.dbFilePath,
    schemaFilePath: config.schemaFilePath,
    postgresSchemaFilePath: config.postgresSchemaFilePath,
    postgresMigrationsDirPath: config.postgresMigrationsDirPath,
    logger,
    metrics: operationalMetrics
});
operationalMetrics.setDatabase(db);
let redisClient = null;
let redisSocketAdapter = null;
let roomStore;

try {
    if (config.redis.enabled) {
        redisClient = await createRedisClient({
            url: config.redis.url,
            connectTimeoutMs: config.redis.connectTimeoutMs,
            logger,
            metrics: operationalMetrics
        });
        operationalMetrics.setRedisClient(redisClient);
        if (config.socket.redisAdapter.enabled) {
            redisSocketAdapter = await createRedisSocketAdapter({
                io,
                redisClient,
                keyPrefix: config.redis.keyPrefix,
                requestsTimeoutMs: config.socket.redisAdapter.requestsTimeoutMs,
                logger,
                metrics: operationalMetrics
            });
        }
        roomStore = await createRedisRoomStore({
            redisClient,
            keyPrefix: config.redis.keyPrefix,
            roomTtlSeconds: config.redis.roomTtlSeconds,
            saveDebounceMs: config.rooms.saveDebounceMs,
            driversRepository,
            logger,
            metrics: operationalMetrics,
            distributedCoordinationEnabled: config.redis.distributedRoomCoordinationEnabled,
            roomLockTtlMs: config.redis.roomLockTtlMs,
            roomLockWaitTimeoutMs: config.redis.roomLockWaitTimeoutMs
        });
    } else {
        roomStore = createPersistentRoomStore({
            persistenceFilePath: config.rooms.persistenceFilePath,
            saveDebounceMs: config.rooms.saveDebounceMs,
            driversRepository,
            logger
        });
    }
} catch (error) {
    await Promise.allSettled([
        redisSocketAdapter?.close?.(),
        closeRedisClient(redisClient),
        db.closeConnection?.()
    ]);
    throw error;
}
operationalMetrics.setRoomStore(roomStore);
const sessionService = createSessionService(db, {
    cookieName: config.auth.sessionCookieName,
    sessionMaxAgeMs: config.auth.sessionMaxAgeMs,
    socketAuthTokenMaxAgeMs: config.auth.socketAuthTokenMaxAgeMs,
    sessionCleanupIntervalMs: config.auth.sessionCleanupIntervalMs,
    socketAuthSecret: config.auth.socketAuthSecret
});
const authService = createAuthService(db, sessionService);
const accountStatsService = createAccountStatsService(db);
const runtimeSettingsService = createRuntimeSettingsService({
    database: db,
    io,
    logger,
    refreshIntervalMs: config.admin.runtimeSettingsRefreshIntervalMs
});
await runtimeSettingsService.refresh({ emit: false });
runtimeSettingsService.start();
const adminAccess = createAdminAccess({
    accountUuids: config.admin.accountUuids,
    legacyUserIds: config.admin.userIds
});
if (adminAccess.usesLegacyUserIds) {
    logger.warn('Admin access still uses legacy numeric user IDs. Configure ADMIN_ACCOUNT_UUIDS and remove ADMIN_USER_IDS.', {
        adminAuthorizationMode: adminAccess.mode
    });
}
const adminService = createAdminService({
    database: db,
    roomStore,
    io,
    sessionService,
    runtimeSettingsService,
    redisClient,
    databaseProvider: config.database.provider,
    redisEnabled: config.redis.enabled,
    adminLoginNotifierEnabled: Boolean(config.admin.loginNotifications.webhookUrl),
    isAdminUser: adminAccess.isAdminUser,
    auditPolicy: config.admin.audit
});
const adminLoginNotifier = createAdminLoginNotifier({
    isAdminUser: adminAccess.isAdminUser,
    recordAuditEvent: entry => adminService.recordAuditEvent(entry),
    webhookUrl: config.admin.loginNotifications.webhookUrl,
    webhookTimeoutMs: config.admin.loginNotifications.webhookTimeoutMs,
    logger
});
const adminAuditCleanupService = createAdminAuditCleanupService({
    databaseOrRepository: db,
    retentionDays: config.admin.audit.retentionDays,
    cleanupIntervalMs: config.admin.audit.cleanupIntervalMs,
    batchSize: config.admin.audit.cleanupBatchSize,
    maxBatches: config.admin.audit.cleanupMaxBatches,
    logger
});
adminAuditCleanupService.start({ runImmediately: true });
const gameHistoryCleanupService = createGameHistoryCleanupService({
    databaseOrRepository: db,
    retentionDays: config.account.gameHistory.retentionDays,
    cleanupIntervalMs: config.account.gameHistory.cleanupIntervalMs,
    batchSize: config.account.gameHistory.cleanupBatchSize,
    logger
});
gameHistoryCleanupService.start({ runImmediately: true });
const redisRateLimitStore = redisClient
    ? createRedisRateLimitStore({
        redisClient,
        keyPrefix: config.redis.keyPrefix,
        metrics: operationalMetrics
    })
    : null;
const stopExpiredSessionCleanup = sessionService.startExpiredSessionCleanup({
    intervalMs: config.auth.sessionCleanupIntervalMs,
    logger
});
const roomCleanupService = createRoomCleanupService({
    roomStore,
    ...(config.socket.redisAdapter.enabled
        ? {
            resolveActiveSocketIds: async () => new Set(
                (await io.fetchSockets()).map(activeSocket => activeSocket.id)
            )
        }
        : { isSocketActive: socketId => io.sockets.sockets.has(socketId) }),
    cleanupIntervalMs: config.rooms.cleanupIntervalMs,
    inactiveTtlMs: config.rooms.inactiveTtlMs,
    logger,
    metrics: operationalMetrics
});
const stopInactiveRoomCleanup = roomCleanupService.start();
const csrfProtection = createCsrfProtectionMiddleware({
    allowedOrigins: config.socket.allowedOrigins
});

app.use(createSecurityHeadersMiddleware({
    isProduction: config.isProduction
}));
app.use(createRequestLoggingMiddleware({
    logger,
    enabled: config.logging.requestLoggingEnabled
}));
app.use(createResponseCompressionMiddleware());
app.use(createMetricsRoutes({
    enabled: config.metrics.enabled,
    token: config.metrics.token,
    operationalMetrics
}));
app.use(
    ['/api/auth', '/api/account', '/api/admin'],
    createApiRequestContextMiddleware(sessionService)
);
app.use('/api/auth', csrfProtection);
app.use('/api/account', csrfProtection);
app.use('/api/admin', csrfProtection);
app.use('/api', createRuntimeSettingsRoutes({ runtimeSettingsService }));
app.use('/api', createHealthRoutes({
    appVersion: packageJson.version,
    nodeEnv: config.nodeEnv,
    persistenceMode: config.persistence.mode,
    databaseProvider: config.database.provider,
    checks: createHealthChecks({
        db,
        redisClient,
        driversRepository,
        roomStore,
        metrics: operationalMetrics
    })
}));
app.use('/api/auth', createAuthRoutes({
    authService,
    sessionService,
    rateLimitStore: redisRateLimitStore,
    logger,
    metrics: operationalMetrics,
    cookieOptions: config.auth.cookie,
    onLoginSuccess: ({ user, request }) => adminLoginNotifier.notify({
        user,
        request,
        authorizationMode: adminAccess.mode
    })
}));
app.use('/api/account', createAccountRoutes({
    accountStatsService,
    authService,
    sessionService,
    rateLimitStore: redisRateLimitStore,
    logger,
    metrics: operationalMetrics,
    cookieOptions: config.auth.cookie
}));
app.use('/api/admin', createAdminRoutes({
    adminAccess,
    adminService,
    authService,
    rateLimitStore: redisRateLimitStore,
    logger,
    metrics: operationalMetrics
}));
app.use('/admin', createAdminPageRoutes({
    sessionService,
    adminAccess,
    uiDirectoryPath: path.join(__dirname, 'admin', 'ui')
}));
app.use(express.static(config.publicDir, {
    etag: true,
    lastModified: true,
    setHeaders: setStaticCacheHeaders
}));

const socketRateLimit = redisClient
    ? {
        ...config.socket.rateLimit,
        store: redisRateLimitStore,
        identityResolver: getDistributedSocketIdentity,
        logger,
        metrics: operationalMetrics
    }
    : { ...config.socket.rateLimit, metrics: operationalMetrics };

registerSocketHandlers(io, {
    roomStore,
    gameService,
    sessionService,
    accountStatsService,
    logger,
    metrics: operationalMetrics,
    runtimeSettingsService,
    socketRateLimit
});

app.use(createErrorMiddleware({
    isProduction: config.isProduction,
    logger
}));

async function shutdownRoomStore() {
    try {
        await roomStore.close?.();
    } catch (error) {
        logger.error('[rooms] Nu am putut salva camerele la închidere.', { error });
    }
}

function prepareApplicationShutdown() {
    adminAuditCleanupService.stopScheduling();
    gameHistoryCleanupService.stopScheduling();
    runtimeSettingsService.stop();
    stopInactiveRoomCleanup?.();
    const disconnectTarget = config.socket.redisAdapter.enabled && io.local ? io.local : io;
    disconnectTarget.disconnectSockets?.(true);
}

async function cleanupApplicationResources() {
    stopExpiredSessionCleanup?.();
    stopInactiveRoomCleanup?.();
    await Promise.all([
        adminAuditCleanupService.stop(),
        gameHistoryCleanupService.stop()
    ]);
    await shutdownRoomStore();
    const connectionResults = await Promise.allSettled([
        redisSocketAdapter?.close?.(),
        db.closeConnection?.(),
        closeRedisClient(redisClient)
    ]);
    const connectionErrors = connectionResults
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);
    if (connectionErrors.length > 0) {
        throw new AggregateError(connectionErrors, 'Failed to close application connections.');
    }
}

process.once('beforeExit', shutdownRoomStore);

server.on('error', createServerErrorHandler({
    port: config.port,
    logger
}));

registerProcessErrorHandlers({
    logger,
    server,
    beforeShutdown: prepareApplicationShutdown,
    cleanup: cleanupApplicationResources
});

server.listen(config.port, () => {
    logger.info('F1 Guesser Duel server started.', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        persistenceMode: config.persistence.mode,
        databaseProvider: config.database.provider,
        redisEnabled: config.redis.enabled,
        socketAdapterProvider: redisSocketAdapter?.provider || 'memory',
        distributedRoomCoordinationEnabled: roomStore.distributedCoordinationEnabled === true,
        roomPersistenceProvider: roomStore.provider || 'file',
        roomCleanupIntervalMs: config.rooms.cleanupIntervalMs,
        roomInactiveTtlMs: config.rooms.inactiveTtlMs,
        gameHistoryRetentionDays: config.account.gameHistory.retentionDays,
        gameHistoryCleanupIntervalMs: config.account.gameHistory.cleanupIntervalMs,
        gameHistoryCleanupBatchSize: config.account.gameHistory.cleanupBatchSize,
        adminAuditRetentionDays: config.admin.audit.retentionDays,
        adminAuditCleanupIntervalMs: config.admin.audit.cleanupIntervalMs,
        adminAuditCleanupBatchSize: config.admin.audit.cleanupBatchSize,
        adminAuditCleanupMaxBatches: config.admin.audit.cleanupMaxBatches,
        adminAuditExportMaxRows: config.admin.audit.exportMaxRows,
        runtimeSettingsRefreshIntervalMs: config.admin.runtimeSettingsRefreshIntervalMs,
        adminLoginWebhookEnabled: adminLoginNotifier.enabled,
        rateLimitProvider: redisClient ? 'redis' : 'memory'
    });
});

return {
    app,
    server,
    io,
    db,
    redisClient,
    redisSocketAdapter,
    roomStore,
    roomCleanupService,
    gameHistoryCleanupService,
    adminAuditCleanupService,
    runtimeSettingsService,
    adminLoginNotifier
};
}


startServer().catch(error => {
    logger.error('F1 Guesser Duel server failed to start.', { error });
    process.exitCode = 1;
});
