const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 1. Calea către folderul public (unde e index.html)
app.use(express.static(path.join(__dirname, 'public')));

// 2. Calea către baza de date JSON
const driversPath = path.join(__dirname, 'drivers.json');
const driversData = JSON.parse(fs.readFileSync(driversPath, 'utf8'));


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
        room.attempts[socket.id]++;

        const guessDriver = room.driversList.find(d => d.id === driverId);
        if (!guessDriver) return;

        const isWin = guessDriver.id === room.targetDriver.id;
        
        socket.emit('guessResult', {
            guess: guessDriver,
            target: room.targetDriver,
            isWin: isWin,
            attempts: room.attempts[socket.id]
        });
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

// LOGICĂ INTELIGENTĂ DE SERVIRE (Caută în folderul /public)
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