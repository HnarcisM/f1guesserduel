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
const { createDatabase } = require('./db/database');
const { createSessionService } = require('./auth/sessionService');
const { createAuthService } = require('./auth/authService');
const { createAuthRoutes } = require('./auth/authRoutes');
const { createAuthMiddleware } = require('./middleware/authMiddleware');
const { createErrorMiddleware } = require('./middleware/errorMiddleware');
const { createServerErrorHandler } = require('./middleware/serverErrorHandler');
const { createHealthRoutes } = require('./routes/healthRoutes');
const { createAppConfig } = require('./config/appConfig');

const config = createAppConfig(process.env, {
    projectRoot: path.join(__dirname, '..')
});

const app = express();
if (config.trustProxy) {
    app.set('trust proxy', 1);
}
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000
});

const driversRepository = createDriversRepository({
    driversFilePath: config.driversFilePath
});
const gameService = createGameService(driversRepository);
const roomStore = createPersistentRoomStore({
    persistenceFilePath: config.rooms.persistenceFilePath,
    saveDebounceMs: config.rooms.saveDebounceMs,
    driversRepository
});
const db = createDatabase({
    dbFilePath: config.dbFilePath,
    schemaFilePath: config.schemaFilePath
});
const sessionService = createSessionService(db, {
    cookieName: config.auth.sessionCookieName,
    sessionMaxAgeMs: config.auth.sessionMaxAgeMs,
    socketAuthTokenMaxAgeMs: config.auth.socketAuthTokenMaxAgeMs,
    sessionCleanupIntervalMs: config.auth.sessionCleanupIntervalMs,
    socketAuthSecret: config.auth.socketAuthSecret
});
const authService = createAuthService(db, sessionService);
sessionService.startExpiredSessionCleanup({
    intervalMs: config.auth.sessionCleanupIntervalMs
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

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(createAuthMiddleware(sessionService));
app.use('/api', createHealthRoutes());
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
    sessionService
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
    isProduction: config.isProduction
}));

function shutdownRoomStore() {
    try {
        roomStore.close?.();
    } catch (error) {
        console.error('[rooms] Nu am putut salva camerele la închidere:', error.message);
    }
}

process.once('exit', shutdownRoomStore);

server.on('error', createServerErrorHandler({
    port: config.port
}));

server.listen(config.port, () => {
    console.log(`===================================================`);
    console.log(` 🏎️  F1 GUESSER DUEL RULEAZĂ ACUM!`);
    console.log(` 🌐 Accesează în browser: http://localhost:${config.port}`);
    console.log(`===================================================`);
});
