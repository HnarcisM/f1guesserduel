const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const { createDriversRepository } = require('./data/driversRepository');
const { createGameService } = require('./game/gameService');
const { createMemoryRoomStore } = require('./rooms/roomStore.memory');
const { registerSocketHandlers } = require('./socket/registerSocketHandlers');
const { createDatabase } = require('./db/database');
const { createSessionService } = require('./auth/sessionService');
const { createAuthService } = require('./auth/authService');
const { createAuthRoutes } = require('./auth/authRoutes');
const { createAuthMiddleware } = require('./middleware/authMiddleware');
const { createHealthRoutes } = require('./routes/healthRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const driversRepository = createDriversRepository({
    driversFilePath: path.join(__dirname, '..', 'drivers.json')
});
const gameService = createGameService(driversRepository);
const roomStore = createMemoryRoomStore();
const db = createDatabase({
    dbFilePath: path.join(DATA_DIR, 'f1guesser.sqlite'),
    schemaFilePath: path.join(__dirname, 'db', 'schema.sql')
});
const sessionService = createSessionService(db);
const authService = createAuthService(db, sessionService);

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
app.use('/api/auth', createAuthRoutes({ authService, sessionService }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: setStaticCacheHeaders
}));

registerSocketHandlers(io, {
    roomStore,
    gameService,
    sessionService
});

app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const txtPath = path.join(__dirname, '..', 'public', 'index.txt');

    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else if (fs.existsSync(txtPath)) {
        res.sendFile(txtPath);
    } else {
        res.status(404).send("<h2>Eroare: Nu am găsit 'index.html' în folderul /public! Asigură-te că fișierul se află acolo.</h2>");
    }
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` 🏎️  F1 GUESSER DUEL RULEAZĂ ACUM!`);
    console.log(` 🌐 Accesează în browser: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
