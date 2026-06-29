const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const { createDriversRepository } = require('./data/driversRepository');
const { createGameService } = require('./game/gameService');
const { createMemoryRoomStore } = require('./rooms/roomStore.memory');
const { registerSocketHandlers } = require('./socket/registerSocketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const driversRepository = createDriversRepository({
    driversFilePath: path.join(__dirname, '..', 'drivers.json')
});
const gameService = createGameService(driversRepository);
const roomStore = createMemoryRoomStore();

app.use(express.static(path.join(__dirname, '..', 'public')));

registerSocketHandlers(io, {
    roomStore,
    gameService
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
