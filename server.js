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

// Expune index.html, style.css, game.js, flags și logos din folderul public.
app.use(express.static(path.join(__dirname, 'public')));

// Starea camerelor active. Cheia este roomId-ul din URL.
const rooms = {};

/**
 * Încarcă piloții din drivers.json și filtrează lista după dificultate.
 * Fișierul permite comentarii bloc /* ... *\/ pe care le eliminăm înainte de JSON.parse.
 */
function getDriversByDifficulty(difficulty, callback) {
    const filePath = path.join(__dirname, 'drivers.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return callback(err, null);
        try {
            let cleanData = data.replace(/\/\*[\s\S]*?\*\//g, ""); 
            let drivers = JSON.parse(cleanData);
            if (difficulty && difficulty !== 'all') {
                drivers = drivers.filter(d => d.difficulty === difficulty);
            }
            callback(null, drivers);
        } catch (e) {
            callback(e, null);
        }
    });
}

// Pentru fiecare client conectat, păstrăm local camera curentă a socket-ului.
io.on('connection', (socket) => {
    let currentRoom = null;

    // Clientul intră într-o cameră. Dacă aceasta nu există, o creăm.
    socket.on('joinRoom', (roomId) => {
        currentRoom = roomId;
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                targetDriver: null,
                difficulty: null,
                driversList: [],
                attempts: {},
                timed: false,
                timeLimitSeconds: 60,
                roundStartedAt: null
            };
        }

        // VERIFICARE CRITICĂ: Împiedică adăugarea aceluiași socket ID de mai multe ori
		if (!rooms[roomId].players.includes(socket.id)) {
			rooms[roomId].players.push(socket.id);
		}
        io.to(roomId).emit('roomUpdate', { playerCount: rooms[roomId].players.length });

        if (rooms[roomId].difficulty) {
            socket.emit('initGame', { drivers: rooms[roomId].driversList, difficulty: rooms[roomId].difficulty, timed: rooms[roomId].timed, timeLimitSeconds: rooms[roomId].timeLimitSeconds, roundStartedAt: rooms[roomId].roundStartedAt });
        }
    });

    // Setarea dificultății pornește o rundă nouă pentru toți jucătorii din cameră.
    socket.on('setDifficulty', (payload) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        const difficulty = typeof payload === 'object' && payload !== null ? payload.level : payload;
        const timed = Boolean(typeof payload === 'object' && payload !== null && payload.timed);
        const timeLimitSeconds = Number(payload && payload.timeLimitSeconds) || 60;
        
        rooms[currentRoom].difficulty = difficulty;
        rooms[currentRoom].timed = timed;
        rooms[currentRoom].timeLimitSeconds = timeLimitSeconds;
        rooms[currentRoom].roundStartedAt = Date.now();
        rooms[currentRoom].attempts = {};

        getDriversByDifficulty(difficulty, (err, drivers) => {
            if (err || drivers.length === 0) {
                console.error("Eroare la încărcarea piloților:", err);
                return;
            }
            
            rooms[currentRoom].driversList = drivers;
            const randomIdx = Math.floor(Math.random() * drivers.length);
            rooms[currentRoom].targetDriver = drivers[randomIdx];

            io.to(currentRoom).emit('initGame', { drivers: drivers, difficulty: difficulty, timed: rooms[currentRoom].timed, timeLimitSeconds: rooms[currentRoom].timeLimitSeconds, roundStartedAt: rooms[currentRoom].roundStartedAt });
        });
    });

    // Primește ghicirea clientului, calculează rezultatele și răspunde doar acelui jucător.
    socket.on('submitGuess', (driverId) => {
        if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].targetDriver) return;

        const room = rooms[currentRoom];

        if (room.timed && room.roundStartedAt && Date.now() - room.roundStartedAt >= room.timeLimitSeconds * 1000) {
            room.attempts[socket.id] = 6;
            socket.emit('gameTimedOut', { target: { name: room.targetDriver.name }, attempts: 6 });
            return;
        }

        if (!room.attempts[socket.id]) room.attempts[socket.id] = 0;
        
        // Dacă jocul s-a terminat deja pentru acest jucător, blocăm execuția suplimentară
        if (room.attempts[socket.id] >= 6) return;

        room.attempts[socket.id]++;

        const guessDriver = room.driversList.find(d => d.id === driverId);
        if (!guessDriver) return;

        const target = room.targetDriver;
        
        // --- PROCESARE LOGICĂ & CULORI SECURIZAT PE SERVER ---
        const results = {
            name: guessDriver.id === target.id ? 'green' : 'red',
            nat: guessDriver.nat === target.nat ? 'green' : 'red',
            team: 'red',
            age: target.age > guessDriver.age ? 'orange' : (target.age < guessDriver.age ? 'purple' : 'green'),
            debut: target.debut > guessDriver.debut ? 'orange' : (target.debut < guessDriver.debut ? 'purple' : 'green'),
            wins: target.wins > guessDriver.wins ? 'orange' : (target.wins < guessDriver.wins ? 'purple' : 'green')
        };

        let currentGuessTeam = guessDriver.team[0];
        if (target.team.includes(currentGuessTeam)) {
            results.team = (currentGuessTeam === target.team[0]) ? 'green' : 'yellow';
        }

        const isCorrect = guessDriver.id === target.id;
        const isGameOver = isCorrect || room.attempts[socket.id] >= 6;

        // Construim răspunsul securizat
        const responseData = {
            guess: guessDriver,
            results: results,
            attempts: room.attempts[socket.id],
            isCorrect: isCorrect,
            isGameOver: isGameOver
        };

        // Doar când jocul s-a terminat dezvăluim numele complet al pilotului țintă
        if (isGameOver) {
            responseData.target = { name: target.name };
        }

        socket.emit('guessResult', responseData);
    });


    // Timer expirat pe client: serverul confirmă finalul și dezvăluie pilotul țintă.
    socket.on('timeExpired', () => {
        if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].targetDriver) return;

        const room = rooms[currentRoom];
        if (!room.timed || !room.roundStartedAt) return;

        const elapsedMs = Date.now() - room.roundStartedAt;
        if (elapsedMs < room.timeLimitSeconds * 1000 - 500) return;

        room.attempts[socket.id] = 6;
        socket.emit('gameTimedOut', {
            target: { name: room.targetDriver.name },
            attempts: 6
        });
    });

    // Restartul păstrează dificultatea, dar alege un nou pilot țintă și resetează încercările.
    socket.on('restartGame', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        room.attempts = {};
        
        if (room.difficulty) {
            getDriversByDifficulty(room.difficulty, (err, drivers) => {
                if (!err && drivers.length > 0) {
                    const randomIdx = Math.floor(Math.random() * drivers.length);
                    room.targetDriver = drivers[randomIdx];
                    room.roundStartedAt = Date.now();
                    io.to(currentRoom).emit('gameRestarted', {
                        timed: room.timed,
                        timeLimitSeconds: room.timeLimitSeconds,
                        roundStartedAt: room.roundStartedAt
                    });
                }
            });
        }
    });

    // Curățare la deconectare: scoatem jucătorul din cameră și ștergem camera dacă devine goală.
    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom].players = rooms[currentRoom].players.filter(id => id !== socket.id);
            io.to(currentRoom).emit('roomUpdate', { playerCount: rooms[currentRoom].players.length });
            if (rooms[currentRoom].players.length === 0) {
                delete rooms[currentRoom];
            }
        }
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
        res.status(404).send("<h2>Eroare: Nu am găsit 'index.html' în folderul /public! Asegură-te că fișierul se află acolo.</h2>");
    }
});

// Pornirea serverului.
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` 🏎️  F1 GUESSER DUEL RULEAZĂ ACUM!`);
    console.log(` 🌐 Accesează în browser: http://localhost:${PORT}`);
    console.log(`===================================================`);
});