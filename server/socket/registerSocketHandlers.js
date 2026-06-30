const {
    MAX_ATTEMPTS,
    MAX_PLAYERS_PER_ROOM,
    isValidRoomId
} = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const {
    createRoom,
    addPlayerToRoom,
    removePlayerFromRoom,
    refreshRoomMemberAuth,
    getPlayer,
    hasRoomMember,
    isHost,
    isSpectator,
    getRoomMemberCount,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState
} = require('../rooms/roomService');
const { attachSocketAuth } = require('./socketAuth');
const { createRoomStateEmitter } = require('./roomStateEmitter');
const {
    normalizeClientAuthUser,
    normalizeDriverId,
    normalizeRoundOptions,
    normalizeRestartOptions
} = require('./socketPayloadValidators');

function registerSocketHandlers(io, dependencies) {
    const { roomStore, gameService, sessionService } = dependencies;

    attachSocketAuth(io, sessionService);

    const {
        cleanupInactiveMembers,
        emitGameStateToActiveRoomMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate
    } = createRoomStateEmitter(io, roomStore);

    io.on('connection', (socket) => {
        let currentRoom = null;

        socket.on('joinRoom', (roomId) => {
            if (!isValidRoomId(roomId)) {
                socket.emit('errorMessage', 'Camera este invalidă. Folosește un room ID de 3-20 caractere.');
                return;
            }

            if (!roomStore.has(roomId)) {
                roomStore.set(roomId, createRoom(roomId, socket.id, socket.user || null));
            }

            const room = roomStore.get(roomId);
            cleanupInactiveMembers(roomId, room);
            const joinResult = addPlayerToRoom(room, socket.id, socket.user || null);

            if (!joinResult || !joinResult.joined) {
                socket.emit('roomFull', { maxPlayers: MAX_PLAYERS_PER_ROOM });
                return;
            }

            currentRoom = roomId;
            socket.join(roomId);
            emitHostStatus(socket, room);
            emitRoomStateUpdate(roomId, 'join');

            if (room.difficulty && room.roundState === 'playing') {
                const initPayload = {
                    drivers: room.driversList,
                    difficulty: room.difficulty,
                    timed: room.timed,
                    timeLimitSeconds: room.timeLimitSeconds,
                    roundStartedAt: room.roundStartedAt
                };

                if (isSpectator(room, socket.id)) {
                    initPayload.liveBoard = buildLiveBoardState(room);
                }

                socket.emit('initGame', initPayload);
            }
        });

        socket.on('setDifficulty', (payload) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Ești în modul spectator. Doar cei 2 jucători activi pot controla jocul.');
                return;
            }

            if (!isHost(room, socket.id)) {
                socket.emit('errorMessage', 'Doar hostul camerei poate schimba dificultatea.');
                return;
            }

            const roundOptions = normalizeRoundOptions(payload);
            if (!roundOptions) {
                socket.emit('errorMessage', 'Dificultatea selectată nu este validă.');
                return;
            }

            const initPayload = gameService.startNewRound(room, roundOptions);
            if (!initPayload) {
                socket.emit('errorMessage', 'Nu am putut porni runda pentru dificultatea selectată.');
                return;
            }

            emitGameStateToActiveRoomMembers(currentRoom, 'initGame', initPayload, {
                includeLiveBoardForSpectators: true
            });
            emitRoomStateUpdate(currentRoom, 'round-started');
        });

        socket.on('submitGuess', (driverId) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Ești spectator în această cameră. Poți urmări jocul, dar nu poți trimite încercări.');
                return;
            }

            const player = getPlayer(room, socket.id);
            if (!player || !room.targetDriver || room.roundState !== 'playing') return;
            if (player.finished) return;

            if (room.timed && room.roundStartedAt && Date.now() - room.roundStartedAt >= room.timeLimitSeconds * 1000) {
                player.attempts = MAX_ATTEMPTS;
                markPlayerTimedOut(player);
                socket.emit('gameTimedOut', { target: { name: room.targetDriver.name }, attempts: MAX_ATTEMPTS });
                emitRoomStateUpdate(currentRoom, 'timeout');
                return;
            }

            if (typeof player.attempts !== 'number') player.attempts = 0;
            if (player.attempts >= MAX_ATTEMPTS) return;

            const normalizedDriverId = normalizeDriverId(driverId);
            if (!normalizedDriverId) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru runda curentă.');
                return;
            }

            const guessDriver = room.driversList.find(driver => driver.id === normalizedDriverId);
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

            recordPlayerGuess(player, guessDriver, results, isCorrectGuess, isGameOver);

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
            emitRoomStateUpdate(currentRoom, 'guess');
        });

        socket.on('timeExpired', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) return;

            const player = getPlayer(room, socket.id);
            if (!player || !room.targetDriver || !room.timed || !room.roundStartedAt) return;
            if (player.finished) return;

            const elapsedMs = Date.now() - room.roundStartedAt;
            if (elapsedMs < room.timeLimitSeconds * 1000 - 500) return;

            player.attempts = MAX_ATTEMPTS;
            markPlayerTimedOut(player);
            socket.emit('gameTimedOut', {
                target: { name: room.targetDriver.name },
                attempts: MAX_ATTEMPTS
            });
            emitRoomStateUpdate(currentRoom, 'timeout');
        });

        socket.on('restartGame', (payload = {}) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Ești în modul spectator. Doar hostul poate porni un rematch.');
                return;
            }

            if (!isHost(room, socket.id)) {
                socket.emit('errorMessage', 'Doar hostul camerei poate porni un rematch.');
                return;
            }

            const restartPayload = gameService.restartRound(room, normalizeRestartOptions(payload));
            if (!restartPayload) {
                socket.emit('errorMessage', 'Nu am putut reporni runda. Alege mai întâi o dificultate.');
                return;
            }

            emitGameStateToActiveRoomMembers(currentRoom, 'gameRestarted', restartPayload, {
                includeLiveBoardForSpectators: true
            });
            emitRoomStateUpdate(currentRoom, 'restart');
        });


        socket.on('refreshAuthUser', (userPayload = null) => {
            const room = currentRoom ? roomStore.get(currentRoom) : null;
            const authUser = normalizeClientAuthUser(userPayload);
            socket.user = authUser;

            if (!room) return;

            const member = refreshRoomMemberAuth(room, socket.id, authUser);
            if (!member) return;

            emitHostStatus(socket, room);
            emitRoomStateUpdate(currentRoom, 'auth-updated');
            emitRoomRoleStatuses(room);
        });

        function leaveCurrentRoom() {
            if (!currentRoom) return;

            const roomId = currentRoom;
            const room = roomStore.get(roomId);
            currentRoom = null;

            if (!room) return;

            if (hasRoomMember(room, socket.id)) {
                removePlayerFromRoom(room, socket.id);
            }

            cleanupInactiveMembers(roomId, room);

            if (getRoomMemberCount(room) === 0) {
                roomStore.remove(roomId);
                return;
            }

            emitRoomStateUpdate(roomId, 'leave');
            emitRoomRoleStatuses(room);
        }

        socket.on('disconnecting', leaveCurrentRoom);
        socket.on('disconnect', leaveCurrentRoom);
    });
}

module.exports = {
    registerSocketHandlers
};
