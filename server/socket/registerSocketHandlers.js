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
    removeInactiveRoomMembers,
    getPlayer,
    getRoomMember,
    hasRoomMember,
    isHost,
    isSpectator,
    getRoomMemberCount,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState,
    buildPublicRoomState
} = require('../rooms/roomService');

function parseCookieHeader(cookieHeader) {
    return String(cookieHeader || '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) return cookies;
            const key = decodeURIComponent(part.slice(0, separatorIndex));
            const value = decodeURIComponent(part.slice(separatorIndex + 1));
            cookies[key] = value;
            return cookies;
        }, {});
}

function registerSocketHandlers(io, dependencies) {
    const { roomStore, gameService, sessionService } = dependencies;

    io.use((socket, next) => {
        if (!sessionService) return next();

        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        const token = cookies[sessionService.cookieName];
        socket.user = sessionService.getUserByToken(token);
        return next();
    });

    function isSocketActive(socketId) {
        return io.sockets.sockets.has(socketId);
    }

    function cleanupInactiveMembers(roomId, room) {
        if (!room) return false;
        const changed = removeInactiveRoomMembers(room, isSocketActive);

        if (getRoomMemberCount(room) === 0) {
            roomStore.remove(roomId);
            return true;
        }

        return changed;
    }

    function getActiveRoomSockets(room) {
        const socketIds = new Set([
            ...Object.keys(room.players || {}),
            ...Object.keys(room.spectators || {})
        ]);

        return [...socketIds]
            .map(socketId => io.sockets.sockets.get(socketId))
            .filter(Boolean);
    }

    function emitToActiveRoomMembers(roomId, eventName, payload) {
        const room = roomStore.get(roomId);
        if (!room) return;

        const roomWasRemoved = cleanupInactiveMembers(roomId, room);
        if (roomWasRemoved && !roomStore.has(roomId)) return;

        for (const memberSocket of getActiveRoomSockets(room)) {
            memberSocket.emit(eventName, payload);
        }
    }

    function buildRoomStatePayload(room, reason = 'sync') {
        return {
            reason,
            room: buildPublicRoomState(room),
            liveBoard: buildLiveBoardState(room)
        };
    }

    function emitRoomStateUpdate(roomId, reason = 'sync') {
        const room = roomStore.get(roomId);
        if (!room) return;

        emitToActiveRoomMembers(roomId, 'roomStateUpdate', buildRoomStatePayload(room, reason));
    }

    function emitGameStateToActiveRoomMembers(roomId, eventName, payload) {
        emitToActiveRoomMembers(roomId, eventName, payload);
    }

    function emitHostStatus(socket, room) {
        const member = getRoomMember(room, socket.id);
        const role = member?.role || (isSpectator(room, socket.id) ? 'spectator' : 'player');

        socket.emit('hostStatus', {
            isHost: isHost(room, socket.id),
            isSpectator: role === 'spectator',
            role,
            username: member?.username || socket.user?.username || 'Guest',
            user: socket.user || null
        });
    }

    function emitRoomRoleStatuses(room) {
        for (const member of [...Object.values(room.players || {}), ...Object.values(room.spectators || {})]) {
            const memberSocket = io.sockets.sockets.get(member.socketId);
            if (memberSocket) {
                emitHostStatus(memberSocket, room);
            }
        }
    }

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
                socket.emit('initGame', {
                    drivers: room.driversList,
                    difficulty: room.difficulty,
                    timed: room.timed,
                    timeLimitSeconds: room.timeLimitSeconds,
                    roundStartedAt: room.roundStartedAt,
                    liveBoard: buildLiveBoardState(room)
                });
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

            emitGameStateToActiveRoomMembers(currentRoom, 'initGame', {
                ...initPayload,
                liveBoard: buildLiveBoardState(room)
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

            const restartPayload = gameService.restartRound(room, payload);
            if (!restartPayload) {
                socket.emit('errorMessage', 'Nu am putut reporni runda. Alege mai întâi o dificultate.');
                return;
            }

            emitGameStateToActiveRoomMembers(currentRoom, 'gameRestarted', {
                ...restartPayload,
                liveBoard: buildLiveBoardState(room)
            });
            emitRoomStateUpdate(currentRoom, 'restart');
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
