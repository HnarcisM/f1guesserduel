const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

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

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', (roomId) => {
        currentRoom = roomId;
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                targetDriver: null,
                difficulty: null,
                driversList: [],
                attempts: {}
            };
        }

        rooms[roomId].players.push(socket.id);
        io.to(roomId).emit('roomUpdate', { playerCount: rooms[roomId].players.length });

        if (rooms[roomId].difficulty) {
            socket.emit('initGame', { drivers: rooms[roomId].driversList, difficulty: rooms[roomId].difficulty });
        }
    });

    socket.on('setDifficulty', (difficulty) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].difficulty = difficulty;
        rooms[currentRoom].attempts = {};

        getDriversByDifficulty(difficulty, (err, drivers) => {
            if (err || drivers.length === 0) {
                console.error("Eroare la încărcarea piloților:", err);
                return;
            }
            
            rooms[currentRoom].driversList = drivers;
            const randomIdx = Math.floor(Math.random() * drivers.length);
            rooms[currentRoom].targetDriver = drivers[randomIdx];

            io.to(currentRoom).emit('initGame', { drivers: drivers, difficulty: difficulty });
        });
    });

    socket.on('submitGuess', (driverId) => {
        if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].targetDriver) return;

        const room = rooms[currentRoom];
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

    socket.on('restartGame', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        room.attempts = {};
        
        if (room.difficulty) {
            getDriversByDifficulty(room.difficulty, (err, drivers) => {
                if (!err && drivers.length > 0) {
                    const randomIdx = Math.floor(Math.random() * drivers.length);
                    room.targetDriver = drivers[randomIdx];
                    io.to(currentRoom).emit('gameRestarted');
                }
            });
        }
    });

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

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` 🏎️  F1 GUESSER DUEL RULEAZĂ ACUM!`);
    console.log(` 🌐 Accesează în browser: http://localhost:${PORT}`);
    console.log(`===================================================`);
});