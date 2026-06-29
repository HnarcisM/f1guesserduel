const {
    MAX_ATTEMPTS,
    MAX_PLAYERS_PER_ROOM,
    normalizeTimeLimitSeconds,
    isValidDifficulty,
    isValidRoomId
} = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    buildPublicRoomState
} = require('../rooms/roomService');

function registerSocketHandlers(io, dependencies) {
    const { roomStore, gameService } = dependencies;

    function emitRoomUpdate(roomId) {
        const room = roomStore.get(roomId);
        if (!room) return;
        io.to(roomId).emit('roomUpdate', buildPublicRoomState(room));
    }

    io.on('connection', (socket) => {
        let currentRoom = null;

        socket.on('joinRoom', (roomId) => {
            if (!isValidRoomId(roomId)) {
                socket.emit('errorMessage', 'Camera este invalidă. Folosește un room ID de 3-20 caractere.');
                return;
            }

            if (!roomStore.has(roomId)) {
                roomStore.set(roomId, createRoom(roomId, socket.id));
            }

            const room = roomStore.get(roomId);
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

        socket.on('setDifficulty', (payload) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

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

            const initPayload = gameService.startNewRound(room, { difficulty, timed, timeLimitSeconds });
            if (!initPayload) {
                socket.emit('errorMessage', 'Nu am putut porni runda pentru dificultatea selectată.');
                return;
            }

            io.to(currentRoom).emit('initGame', initPayload);
        });

        socket.on('submitGuess', (driverId) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;
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

        socket.on('timeExpired', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;
            if (!room.players.includes(socket.id) || !room.targetDriver || !room.timed || !room.roundStartedAt) return;

            const elapsedMs = Date.now() - room.roundStartedAt;
            if (elapsedMs < room.timeLimitSeconds * 1000 - 500) return;

            room.attempts[socket.id] = MAX_ATTEMPTS;
            socket.emit('gameTimedOut', {
                target: { name: room.targetDriver.name },
                attempts: MAX_ATTEMPTS
            });
        });

        socket.on('restartGame', (payload = {}) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (room.hostId !== socket.id) {
                socket.emit('errorMessage', 'Doar hostul camerei poate porni un rematch.');
                return;
            }

            const restartPayload = gameService.restartRound(room, payload);
            if (!restartPayload) {
                socket.emit('errorMessage', 'Nu am putut reporni runda. Alege mai întâi o dificultate.');
                return;
            }

            io.to(currentRoom).emit('gameRestarted', restartPayload);
        });

        socket.on('disconnect', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            removePlayerFromRoom(room, socket.id);

            if (room.players.length === 0) {
                roomStore.remove(currentRoom);
                return;
            }

            emitRoomUpdate(currentRoom);
            io.to(room.hostId).emit('hostStatus', { isHost: true });
        });
    });
}

module.exports = {
    registerSocketHandlers
};
