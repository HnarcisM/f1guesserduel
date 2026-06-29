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
    getPlayer,
    hasPlayer,
    isHost,
    getPlayerCount,
    buildPublicRoomState
} = require('../rooms/roomService');

function registerSocketHandlers(io, dependencies) {
    const { roomStore, gameService } = dependencies;

    function emitRoomUpdate(roomId) {
        const room = roomStore.get(roomId);
        if (!room) return;
        io.to(roomId).emit('roomUpdate', buildPublicRoomState(room));
    }

    function emitHostStatus(socket, room) {
        socket.emit('hostStatus', {
            isHost: isHost(room, socket.id),
            username: getPlayer(room, socket.id)?.username || 'Guest'
        });
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
            emitHostStatus(socket, room);
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

            if (!isHost(room, socket.id)) {
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
            emitRoomUpdate(currentRoom);
        });

        socket.on('submitGuess', (driverId) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            const player = getPlayer(room, socket.id);
            if (!player || !room.targetDriver || room.roundState !== 'playing') return;
            if (player.finished) return;

            if (room.timed && room.roundStartedAt && Date.now() - room.roundStartedAt >= room.timeLimitSeconds * 1000) {
                player.attempts = MAX_ATTEMPTS;
                player.finished = true;
                socket.emit('gameTimedOut', { target: { name: room.targetDriver.name }, attempts: MAX_ATTEMPTS });
                emitRoomUpdate(currentRoom);
                return;
            }

            if (typeof player.attempts !== 'number') player.attempts = 0;
            if (player.attempts >= MAX_ATTEMPTS) return;

            const guessDriver = room.driversList.find(driver => driver.id === driverId);
            if (!guessDriver) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru runda curentă.');
                return;
            }

            player.attempts++;

            const target = room.targetDriver;
            const results = compareGuess(guessDriver, target);
            const isCorrectGuess = guessDriver.id === target.id;
            const isGameOver = isCorrectGuess || player.attempts >= MAX_ATTEMPTS;

            if (isGameOver) {
                player.finished = true;
            }

            const responseData = {
                guess: guessDriver,
                results,
                attempts: player.attempts,
                isCorrect: isCorrectGuess,
                isGameOver
            };

            if (isGameOver) {
                responseData.target = { name: target.name };
            }

            socket.emit('guessResult', responseData);

            if (isGameOver) {
                emitRoomUpdate(currentRoom);
            }
        });

        socket.on('timeExpired', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            const player = getPlayer(room, socket.id);
            if (!player || !room.targetDriver || !room.timed || !room.roundStartedAt) return;
            if (player.finished) return;

            const elapsedMs = Date.now() - room.roundStartedAt;
            if (elapsedMs < room.timeLimitSeconds * 1000 - 500) return;

            player.attempts = MAX_ATTEMPTS;
            player.finished = true;
            socket.emit('gameTimedOut', {
                target: { name: room.targetDriver.name },
                attempts: MAX_ATTEMPTS
            });
            emitRoomUpdate(currentRoom);
        });

        socket.on('restartGame', (payload = {}) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (!isHost(room, socket.id)) {
                socket.emit('errorMessage', 'Doar hostul camerei poate porni un rematch.');
                return;
            }

            const restartPayload = gameService.restartRound(room, payload);
            if (!restartPayload) {
                socket.emit('errorMessage', 'Nu am putut reporni runda. Alege mai întâi o dificultate.');
                return;
            }

            io.to(currentRoom).emit('gameRestarted', restartPayload);
            emitRoomUpdate(currentRoom);
        });

        socket.on('disconnect', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;
            if (!hasPlayer(room, socket.id)) return;

            removePlayerFromRoom(room, socket.id);

            if (getPlayerCount(room) === 0) {
                roomStore.remove(currentRoom);
                return;
            }

            emitRoomUpdate(currentRoom);
            const newHostSocket = room.hostId ? io.sockets.sockets.get(room.hostId) : null;
            if (newHostSocket) {
                emitHostStatus(newHostSocket, room);
            }
        });
    });
}

module.exports = {
    registerSocketHandlers
};
