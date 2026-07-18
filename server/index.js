const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const { createDriversRepository } = require('./data/driversRepository');
const { createGameService } = require('./game/gameService');
const { createPersistentRoomStore } = require('./rooms/roomStore.persistent');
const { registerSocketHandlers } = require('./socket/registerSocketHandlers');
const { createSocketServerOptions } = require('./socket/socketServerOptions');
const { createDatabase } = require('./db/database');
const { createSessionService } = require('./auth/sessionService');
const { createAuthService } = require('./auth/authService');
const { createAuthRoutes } = require('./auth/authRoutes');
const { createAuthMiddleware } = require('./middleware/authMiddleware');
const { createErrorMiddleware } = require('./middleware/errorMiddleware');
const { createServerErrorHandler } = require('./middleware/serverErrorHandler');
const { createHealthRoutes, createHealthChecks } = require('./routes/healthRoutes');
const { createSecurityHeadersMiddleware } = require('./middleware/securityHeaders');
const { createRequestLoggingMiddleware } = require('./middleware/requestLogging');
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
const roomStore = createPersistentRoomStore({
    persistenceFilePath: config.rooms.persistenceFilePath,
    saveDebounceMs: config.rooms.saveDebounceMs,
    driversRepository,
    logger
});
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
    logger
});
const sessionService = createSessionService(db, {
    cookieName: config.auth.sessionCookieName,
    sessionMaxAgeMs: config.auth.sessionMaxAgeMs,
    socketAuthTokenMaxAgeMs: config.auth.socketAuthTokenMaxAgeMs,
    sessionCleanupIntervalMs: config.auth.sessionCleanupIntervalMs,
    socketAuthSecret: config.auth.socketAuthSecret
});
const authService = createAuthService(db, sessionService);
const stopExpiredSessionCleanup = sessionService.startExpiredSessionCleanup({
    intervalMs: config.auth.sessionCleanupIntervalMs,
    logger
});

function setStaticCacheHeaders(res, filePath) {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.html' || extension === '.txt') {
        res.setHeader('Cache-Control', 'no-cache');
        return;
    }

    if (['.js', '.css'].includes(extension)) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
    }

    if (['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2'].includes(extension)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
}

app.use(createSecurityHeadersMiddleware({
    isProduction: config.isProduction
}));
app.use(createRequestLoggingMiddleware({
    logger,
    enabled: config.logging.requestLoggingEnabled
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(createAuthMiddleware(sessionService));
app.use('/api', createHealthRoutes({
    appVersion: packageJson.version,
    nodeEnv: config.nodeEnv,
    persistenceMode: config.persistence.mode,
    databaseProvider: config.database.provider,
    checks: createHealthChecks({
        db,
        driversRepository,
        roomStore
    })
}));
app.use('/api/auth', createAuthRoutes({
    authService,
    sessionService,
    cookieOptions: config.auth.cookie
}));
app.use(express.static(config.publicDir, {
    etag: true,
    lastModified: true,
    setHeaders: setStaticCacheHeaders
}));

registerSocketHandlers(io, {
    roomStore,
    gameService,
    sessionService,
    socketRateLimit: config.socket.rateLimit
});

app.get('/', (req, res, next) => {
    const htmlPath = path.join(config.publicDir, 'index.html');
    const txtPath = path.join(config.publicDir, 'index.txt');

    if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath, error => {
            if (error) next(error);
        });
    } else if (fs.existsSync(txtPath)) {
        return res.sendFile(txtPath, error => {
            if (error) next(error);
        });
    } else {
        return res.status(404).send("<h2>Eroare: Nu am găsit 'index.html' în folderul /public! Asigură-te că fișierul se află acolo.</h2>");
    }
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
    io.disconnectSockets?.(true);
}

async function cleanupApplicationResources() {
    stopExpiredSessionCleanup?.();
    await shutdownRoomStore();
    await db.closeConnection?.();
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
        databaseProvider: config.database.provider
    });
});

return { app, server, io, db, roomStore };
}


startServer().catch(error => {
    logger.error('F1 Guesser Duel server failed to start.', { error });
    process.exitCode = 1;
});
