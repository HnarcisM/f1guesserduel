/**
 * F1 Guesser Duel - server Node.js + Express + Socket.IO.
 *
 * Responsabilități principale:
 * - servește fișierele statice din /public;
 * - gestionează camerele de joc prin Socket.IO;
 * - alege pilotul țintă pentru fiecare cameră;
 * - validează ghicirile pe server și trimite clientului doar rezultatul calculat;
 * - ține evidența încercărilor per jucător/socket.
 *
 * Important pentru securitate:
 * Pilotul țintă rămâne pe server până la finalul jocului, astfel încât clientul
 * să nu poată citi răspunsul corect din JavaScript înainte de terminarea rundei.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Inițializare Express + server HTTP necesar pentru Socket.IO.
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Portul poate fi suprascris din environment; local folosește 3000.
const PORT = process.env.PORT || 3000;
const DEFAULT_TIME_LIMIT_SECONDS = 60;
const ALLOWED_TIME_LIMIT_SECONDS = [60, 90, 120];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard', 'all'];
const MAX_PLAYERS_PER_ROOM = 2;
const MAX_ATTEMPTS = 6;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

function normalizeTimeLimitSeconds(value) {
    const seconds = Number(value);
    return ALLOWED_TIME_LIMIT_SECONDS.includes(seconds) ? seconds : DEFAULT_TIME_LIMIT_SECONDS;
}

function isValidDifficulty(difficulty) {
    return ALLOWED_DIFFICULTIES.includes(difficulty);
}

function isValidRoomId(roomId) {
    return typeof roomId === 'string' && ROOM_ID_PATTERN.test(roomId);
}

function buildPublicRoomState(room) {
    return {
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
    };
}

// Expune index.html, style.css, game.js, flags și logos din folderul public.
app.use(express.static(path.join(__dirname, 'public')));

// Starea camerelor active. Cheia este roomId-ul din URL.
const rooms = {};

/**
 * Încarcă piloții o singură dată la pornirea serverului.
 * Fișierul permite comentarii bloc /* ... *\/ pe care le eliminăm înainte de JSON.parse.
 */
function loadDrivers() {
    const filePath = path.join(__dirname, 'drivers.json');
    const data = fs.readFileSync(filePath, 'utf8');
    const cleanData = data.replace(/\/\*[\s\S]*?\*\//g, '');
    const drivers = JSON.parse(cleanData);

    if (!Array.isArray(drivers) || drivers.length === 0) {
        throw new Error('drivers.json nu conține o listă validă de piloți.');
    }

    return drivers;
}

const allDrivers = loadDrivers();

function getDriversByDifficulty(difficulty) {
    if (!isValidDifficulty(difficulty)) return [];
    if (difficulty === 'all') return allDrivers;
    return allDrivers.filter(driver => driver.difficulty === difficulty);
}

function createRoom(roomId, hostSocketId) {
    return {
        roomId,
        hostId: hostSocketId,
        players: [],
        targetDriver: null,
        difficulty: null,
        driversList: [],
        attempts: {},
        timed: false,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        roundStartedAt: null,
        roundState: 'waiting'
    };
}

function addPlayerToRoom(room, socketId) {
    if (room.players.includes(socketId)) return true;
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return false;

    room.players.push(socketId);
    room.attempts[socketId] = 0;
    return true;
}

function removePlayerFromRoom(room, socketId) {
    room.players = room.players.filter(id => id !== socketId);
    delete room.attempts[socketId];

    if (room.hostId === socketId) {
        room.hostId = room.players[0] || null;
    }
}

function emitRoomUpdate(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('roomUpdate', buildPublicRoomState(room));
}

function startNewRound(roomId, options) {
    const room = rooms[roomId];
    if (!room) return false;

    const difficulty = options && options.difficulty;
    if (!isValidDifficulty(difficulty)) return false;

    const drivers = getDriversByDifficulty(difficulty);
    if (drivers.length === 0) return false;

    room.difficulty = difficulty;
    room.driversList = drivers;
    room.targetDriver = drivers[Math.floor(Math.random() * drivers.length)];
    room.attempts = Object.fromEntries(room.players.map(socketId => [socketId, 0]));
    room.timed = Boolean(options.timed);
    room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
    room.roundStartedAt = Date.now();
    room.roundState = 'playing';

    io.to(roomId).emit('initGame', {
        drivers,
        difficulty,
        timed: room.timed,
        timeLimitSeconds: room.timeLimitSeconds,
        roundStartedAt: room.roundStartedAt
    });

    return true;
}

function restartRound(roomId, options = {}) {
    const room = rooms[roomId];
    if (!room || !room.difficulty) return false;

    const drivers = getDriversByDifficulty(room.difficulty);
    if (drivers.length === 0) return false;

    room.driversList = drivers;
    room.targetDriver = drivers[Math.floor(Math.random() * drivers.length)];
    room.attempts = Object.fromEntries(room.players.map(socketId => [socketId, 0]));
    room.timed = Boolean(options.timed);
    room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
    room.roundStartedAt = Date.now();
    room.roundState = 'playing';

    io.to(roomId).emit('gameRestarted', {
        timed: room.timed,
        timeLimitSeconds: room.timeLimitSeconds,
        roundStartedAt: room.roundStartedAt
    });

    return true;
}

function getCurrentTeam(driver) {
    return Array.isArray(driver.team) ? driver.team[0] : driver.team;
}

function compareGuess(guessDriver, target) {
    const currentGuessTeam = getCurrentTeam(guessDriver);

    const results = {
        name: guessDriver.id === target.id ? 'green' : 'red',
        nat: guessDriver.nat === target.nat ? 'green' : 'red',
        team: 'red',
        age: target.age > guessDriver.age ? 'orange' : (target.age < guessDriver.age ? 'purple' : 'green'),
        debut: target.debut > guessDriver.debut ? 'orange' : (target.debut < guessDriver.debut ? 'purple' : 'green'),
        wins: target.wins > guessDriver.wins ? 'orange' : (target.wins < guessDriver.wins ? 'purple' : 'green')
    };

    if (Array.isArray(target.team) && target.team.includes(currentGuessTeam)) {
        results.team = currentGuessTeam === target.team[0] ? 'green' : 'yellow';
    }

    return results;
}

// Pentru fiecare client conectat, păstrăm local camera curentă a socket-ului.
io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', (roomId) => {
        if (!isValidRoomId(roomId)) {
            socket.emit('errorMessage', 'Camera este invalidă. Folosește un room ID de 3-20 caractere.');
            return;
        }

        if (!rooms[roomId]) {
            rooms[roomId] = createRoom(roomId, socket.id);
        }

        const room = rooms[roomId];
        const wasAdded = addPlayerToRoom(room, socket.id);

        if (!wasAdded) {
            socket.emit('roomFull', { maxPlayers: MAX_PLAYERS_PER_ROOM });
            return;
        }

        currentRoom = roomId;
        socket.join(roomId);
        socket.emit('hostStatus', { isHost: room.hostId === socket.id });
        emitRoomUpdate(roomId);

        if (room.difficulty && room.roundState === 'playing') {
            socket.emit('initGame', {
                drivers: room.driversList,
                difficulty: room.difficulty,
                timed: room.timed,
                timeLimitSeconds: room.timeLimitSeconds,
                roundStartedAt: room.roundStartedAt
            });
        }
    });

    // Setarea dificultății pornește o rundă nouă pentru toți jucătorii din cameră.
    socket.on('setDifficulty', (payload) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const room = rooms[currentRoom];
        if (room.hostId !== socket.id) {
            socket.emit('errorMessage', 'Doar hostul camerei poate schimba dificultatea.');
            return;
        }

        const difficulty = typeof payload === 'object' && payload !== null ? payload.level : payload;
        const timed = Boolean(typeof payload === 'object' && payload !== null && payload.timed);
        const timeLimitSeconds = normalizeTimeLimitSeconds(payload && payload.timeLimitSeconds);

        if (!isValidDifficulty(difficulty)) {
            socket.emit('errorMessage', 'Dificultatea selectată nu este validă.');
            return;
        }

        const didStart = startNewRound(currentRoom, { difficulty, timed, timeLimitSeconds });
        if (!didStart) {
            socket.emit('errorMessage', 'Nu am putut porni runda pentru dificultatea selectată.');
        }
    });

    // Primește ghicirea clientului, calculează rezultatele și răspunde doar acelui jucător.
    socket.on('submitGuess', (driverId) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const room = rooms[currentRoom];
        if (!room.players.includes(socket.id) || !room.targetDriver || room.roundState !== 'playing') return;

        if (room.timed && room.roundStartedAt && Date.now() - room.roundStartedAt >= room.timeLimitSeconds * 1000) {
            room.attempts[socket.id] = MAX_ATTEMPTS;
            socket.emit('gameTimedOut', { target: { name: room.targetDriver.name }, attempts: MAX_ATTEMPTS });
            return;
        }

        if (typeof room.attempts[socket.id] !== 'number') room.attempts[socket.id] = 0;
        if (room.attempts[socket.id] >= MAX_ATTEMPTS) return;

        const guessDriver = room.driversList.find(driver => driver.id === driverId);
        if (!guessDriver) {
            socket.emit('errorMessage', 'Pilotul ales nu este valid pentru runda curentă.');
            return;
        }

        room.attempts[socket.id]++;

        const target = room.targetDriver;
        const results = compareGuess(guessDriver, target);
        const isCorrect = guessDriver.id === target.id;
        const isGameOver = isCorrect || room.attempts[socket.id] >= MAX_ATTEMPTS;

        const responseData = {
            guess: guessDriver,
            results,
            attempts: room.attempts[socket.id],
            isCorrect,
            isGameOver
        };

        if (isGameOver) {
            responseData.target = { name: target.name };
        }

        socket.emit('guessResult', responseData);
    });

    // Timer expirat pe client: serverul confirmă finalul și dezvăluie pilotul țintă.
    socket.on('timeExpired', () => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const room = rooms[currentRoom];
        if (!room.players.includes(socket.id) || !room.targetDriver || !room.timed || !room.roundStartedAt) return;

        const elapsedMs = Date.now() - room.roundStartedAt;
        if (elapsedMs < room.timeLimitSeconds * 1000 - 500) return;

        room.attempts[socket.id] = MAX_ATTEMPTS;
        socket.emit('gameTimedOut', {
            target: { name: room.targetDriver.name },
            attempts: MAX_ATTEMPTS
        });
    });

    // Restartul păstrează dificultatea, dar poate primi opțiuni noi pentru următoarea rundă.
    socket.on('restartGame', (payload = {}) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const room = rooms[currentRoom];
        if (room.hostId !== socket.id) {
            socket.emit('errorMessage', 'Doar hostul camerei poate porni un rematch.');
            return;
        }

        const didRestart = restartRound(currentRoom, payload);
        if (!didRestart) {
            socket.emit('errorMessage', 'Nu am putut reporni runda. Alege mai întâi o dificultate.');
        }
    });

    // Curățare la deconectare: scoatem jucătorul din cameră și ștergem camera dacă devine goală.
    socket.on('disconnect', () => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const room = rooms[currentRoom];
        removePlayerFromRoom(room, socket.id);

        if (room.players.length === 0) {
            delete rooms[currentRoom];
            return;
        }

        emitRoomUpdate(currentRoom);
        io.to(room.hostId).emit('hostStatus', { isHost: true });
    });
});

// Rută explicită pentru homepage; fallback-ul index.txt există doar ca plasă de siguranță.
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    const txtPath = path.join(__dirname, 'public', 'index.txt');

    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else if (fs.existsSync(txtPath)) {
        res.sendFile(txtPath);
    } else {
        res.status(404).send("<h2>Eroare: Nu am găsit 'index.html' în folderul /public! Asigură-te că fișierul se află acolo.</h2>");
    }
});

// Pornirea serverului.
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` 🏎️  F1 GUESSER DUEL RULEAZĂ ACUM!`);
    console.log(` 🌐 Accesează în browser: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
