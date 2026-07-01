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
    markRoomMemberDisconnectedBySocketId,
    refreshRoomMemberAuth,
    getPlayer,
    hasRoomMember,
    isHost,
    isSpectator,
    getRoomMemberCount,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState,
    buildPersonalRoundResult,
    buildPublicRoomState,
    resolveRoundWinner,
    abortDuelRound
} = require('../rooms/roomService');
const { attachSocketAuth } = require('./socketAuth');
const { createRoomStateEmitter } = require('./roomStateEmitter');
const {
    normalizeDriverId,
    normalizeRoundOptions,
    normalizeRestartOptions
} = require('./socketPayloadValidators');

function registerSocketHandlers(io, dependencies) {
    const { roomStore, gameService, sessionService } = dependencies;
    const dailySessions = new Map();
    const singleSessions = new Map();

    attachSocketAuth(io, sessionService);

    const {
        cleanupInactiveMembers,
        emitGameStateToActiveRoomMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        getActiveRoomSockets
    } = createRoomStateEmitter(io, roomStore);


    function emitRoundResolved(roomId, room, roundResult) {
        if (!room || !roundResult) return;
        roomStore.markDirty?.();

        for (const memberSocket of getActiveRoomSockets(room)) {
            const member = room.players?.[memberSocket.id] || room.spectators?.[memberSocket.id] || null;
            const payload = buildPersonalRoundResult(roundResult, member);
            if (!payload) continue;

            if (isSpectator(room, memberSocket.id)) {
                payload.liveBoard = buildLiveBoardState(room);
            }

            memberSocket.emit('roundResolved', payload);
        }

        emitRoomStateUpdate(roomId, 'round-resolved');
    }

    function normalizeJoinRoomPayload(payload) {
        if (typeof payload === 'string') {
            return { roomId: payload, clientId: null };
        }

        if (!payload || typeof payload !== 'object') {
            return { roomId: null, clientId: null };
        }

        return {
            roomId: typeof payload.roomId === 'string' ? payload.roomId : null,
            clientId: typeof payload.clientId === 'string' ? payload.clientId : null
        };
    }

    function buildPlayerProgressPayload(player) {
        if (!player) return null;
        return {
            attempts: typeof player.attempts === 'number' ? player.attempts : 0,
            finished: Boolean(player.finished),
            timedOut: Boolean(player.timedOut),
            correctGuess: Boolean(player.correctGuess),
            guesses: Array.isArray(player.guesses)
                ? player.guesses.map(entry => ({
                    attempt: entry.attempt,
                    guess: entry.guess,
                    results: entry.results,
                    isCorrect: Boolean(entry.isCorrect),
                    isGameOver: Boolean(entry.isGameOver)
                }))
                : []
        };
    }

    io.on('connection', (socket) => {
        let currentRoom = null;

        socket.on('joinRoom', (payload) => {
            const { roomId, clientId } = normalizeJoinRoomPayload(payload);
            if (!isValidRoomId(roomId)) {
                socket.emit('errorMessage', 'Camera este invalidă. Folosește un room ID de 3-20 caractere.');
                return;
            }

            const memberOptions = { clientId };

            if (!roomStore.has(roomId)) {
                roomStore.set(roomId, createRoom(roomId, socket.id, socket.user || null, memberOptions));
            }

            const room = roomStore.get(roomId);
            if (getRoomMemberCount(room) > 0) {
                cleanupInactiveMembers(roomId, room);
            }
            const joinResult = addPlayerToRoom(room, socket.id, socket.user || null, memberOptions);
            roomStore.markDirty?.();

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
                    roundStartedAt: room.roundStartedAt,
                    isDailyChallenge: Boolean(room.isDailyChallenge),
                    dailyDate: room.dailyDate || null,
                    playerProgress: buildPlayerProgressPayload(getPlayer(room, socket.id))
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

            if (room.roundState === 'playing') {
                socket.emit('errorMessage', 'Nu poți schimba dificultatea sau setările în timpul rundei. Așteaptă finalul rundei.');
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
                const hadRoundResult = Boolean(room.roundResult);
                const roundResult = resolveRoundWinner(room, 'timeout');
                socket.emit('gameTimedOut', {
                    target: { name: room.targetDriver.name },
                    attempts: MAX_ATTEMPTS,
                    roundResult: roundResult ? buildPersonalRoundResult(roundResult, player) : null
                });
                if (roundResult && !hadRoundResult) {
                    emitRoundResolved(currentRoom, room, roundResult);
                } else {
                    emitRoomStateUpdate(currentRoom, roundResult ? 'round-progress' : 'timeout');
                }
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
            const hadRoundResult = Boolean(room.roundResult);
            const roundResult = resolveRoundWinner(room, isCorrectGuess ? 'correct-guess' : 'guess');

            const responseData = {
                guess: guessDriver,
                results,
                attempts: player.attempts,
                isCorrect: isCorrectGuess,
                isGameOver,
                roundResult: roundResult ? buildPersonalRoundResult(roundResult, player) : null
            };

            if (isGameOver) {
                responseData.target = { name: target.name };
            }

            socket.emit('guessResult', responseData);

            if (roundResult && !hadRoundResult) {
                emitRoundResolved(currentRoom, room, roundResult);
            } else {
                emitRoomStateUpdate(currentRoom, roundResult ? 'round-progress' : 'guess');
            }
        });

        socket.on('timeExpired', () => {
            if (!currentRoom) {
                const singleSession = singleSessions.get(socket.id);
                if (!singleSession || singleSession.finished || !singleSession.timed || !singleSession.roundStartedAt) return;

                const elapsedMs = Date.now() - singleSession.roundStartedAt;
                if (elapsedMs < singleSession.timeLimitSeconds * 1000 - 500) return;

                singleSession.attempts = MAX_ATTEMPTS;
                singleSession.finished = true;
                socket.emit('gameTimedOut', {
                    target: { name: singleSession.targetDriver.name },
                    attempts: MAX_ATTEMPTS
                });
                return;
            }

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
            const hadRoundResult = Boolean(room.roundResult);
            const roundResult = resolveRoundWinner(room, 'timeout');
            socket.emit('gameTimedOut', {
                target: { name: room.targetDriver.name },
                attempts: MAX_ATTEMPTS,
                roundResult: roundResult ? buildPersonalRoundResult(roundResult, player) : null
            });
            if (roundResult && !hadRoundResult) {
                emitRoundResolved(currentRoom, room, roundResult);
            } else {
                emitRoomStateUpdate(currentRoom, roundResult ? 'round-progress' : 'timeout');
            }
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

            if (room.roundResult && room.roundState !== 'finished') {
                socket.emit('errorMessage', 'Runda a fost decisă, dar celălalt jucător încă joacă. Așteaptă să termine înainte de rematch.');
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


        socket.on('startSingleGame', (payload) => {
            const roundOptions = normalizeRoundOptions(payload);
            if (!roundOptions) {
                socket.emit('errorMessage', 'Dificultatea selectată nu este validă.');
                return;
            }

            leaveCurrentRoom();

            const singlePayload = gameService.startSingleRound(roundOptions);
            if (!singlePayload) {
                socket.emit('errorMessage', 'Nu am putut porni jocul single pentru dificultatea selectată.');
                return;
            }

            singleSessions.set(socket.id, {
                difficulty: singlePayload.difficulty,
                driversList: singlePayload.drivers,
                targetDriver: singlePayload.targetDriver,
                attempts: 0,
                finished: false,
                timed: singlePayload.timed,
                timeLimitSeconds: singlePayload.timeLimitSeconds,
                roundStartedAt: singlePayload.roundStartedAt
            });

            socket.emit('initGame', {
                drivers: singlePayload.drivers,
                difficulty: singlePayload.difficulty,
                timed: singlePayload.timed,
                timeLimitSeconds: singlePayload.timeLimitSeconds,
                roundStartedAt: singlePayload.roundStartedAt,
                isDailyChallenge: false,
                isSinglePlay: true,
                dailyDate: null
            });
        });

        socket.on('submitSingleGuess', (driverId) => {
            const singleSession = singleSessions.get(socket.id);
            if (!singleSession || singleSession.finished) return;

            if (singleSession.attempts >= MAX_ATTEMPTS) return;

            if (singleSession.timed && singleSession.roundStartedAt && Date.now() - singleSession.roundStartedAt >= singleSession.timeLimitSeconds * 1000) {
                singleSession.attempts = MAX_ATTEMPTS;
                singleSession.finished = true;
                socket.emit('gameTimedOut', { target: { name: singleSession.targetDriver.name }, attempts: MAX_ATTEMPTS });
                return;
            }

            const normalizedDriverId = normalizeDriverId(driverId);
            if (!normalizedDriverId) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru jocul single.');
                return;
            }

            const guessDriver = singleSession.driversList.find(driver => driver.id === normalizedDriverId);
            if (!guessDriver) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru jocul single.');
                return;
            }

            singleSession.attempts++;

            const target = singleSession.targetDriver;
            const results = compareGuess(guessDriver, target);
            const isCorrectGuess = guessDriver.id === target.id;
            const isGameOver = isCorrectGuess || singleSession.attempts >= MAX_ATTEMPTS;

            if (isGameOver) {
                singleSession.finished = true;
            }

            const responseData = {
                guess: guessDriver,
                results,
                attempts: singleSession.attempts,
                isCorrect: isCorrectGuess,
                isGameOver,
                isSinglePlay: true
            };

            if (isGameOver) {
                responseData.target = { name: target.name };
            }

            socket.emit('guessResult', responseData);
        });

        socket.on('restartSingleGame', (payload = {}) => {
            const previousSession = singleSessions.get(socket.id);
            const restartPayload = gameService.restartSingleRound(previousSession, normalizeRestartOptions(payload));
            if (!restartPayload) {
                socket.emit('errorMessage', 'Nu am putut reporni jocul single. Alege mai întâi o dificultate.');
                return;
            }

            singleSessions.set(socket.id, {
                difficulty: restartPayload.difficulty,
                driversList: restartPayload.drivers,
                targetDriver: restartPayload.targetDriver,
                attempts: 0,
                finished: false,
                timed: restartPayload.timed,
                timeLimitSeconds: restartPayload.timeLimitSeconds,
                roundStartedAt: restartPayload.roundStartedAt
            });

            socket.emit('gameRestarted', {
                drivers: restartPayload.drivers,
                difficulty: restartPayload.difficulty,
                timed: restartPayload.timed,
                timeLimitSeconds: restartPayload.timeLimitSeconds,
                roundStartedAt: restartPayload.roundStartedAt,
                isDailyChallenge: false,
                isSinglePlay: true,
                dailyDate: null
            });
        });


        socket.on('startDailyChallenge', (payload) => {
            const dailyOptions = normalizeRoundOptions(payload);
            if (!dailyOptions) {
                socket.emit('dailyChallengeError', 'Dificultatea Daily Challenge nu este validă.');
                return;
            }

            const dailyPayload = gameService.startDailyChallenge(dailyOptions.difficulty, dailyOptions.dailyDate || new Date());
            if (!dailyPayload) {
                socket.emit('dailyChallengeError', 'Nu am putut porni Daily Challenge pentru dificultatea selectată.');
                return;
            }

            dailySessions.set(socket.id, {
                difficulty: dailyPayload.difficulty,
                driversList: dailyPayload.drivers,
                targetDriver: dailyPayload.targetDriver,
                attempts: 0,
                finished: false,
                dailyDate: dailyPayload.dailyDate,
                dailyChallengeId: dailyPayload.dailyChallengeId
            });

            socket.emit('initDailyChallenge', {
                drivers: dailyPayload.drivers,
                difficulty: dailyPayload.difficulty,
                timed: false,
                timeLimitSeconds: null,
                roundStartedAt: dailyPayload.roundStartedAt,
                isDailyChallenge: true,
                dailyDate: dailyPayload.dailyDate,
                dailyChallengeId: dailyPayload.dailyChallengeId
            });
        });

        socket.on('submitDailyGuess', (driverId) => {
            const dailySession = dailySessions.get(socket.id);
            if (!dailySession || dailySession.finished) return;

            if (dailySession.attempts >= MAX_ATTEMPTS) return;

            const normalizedDriverId = normalizeDriverId(driverId);
            if (!normalizedDriverId) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru Daily Challenge.');
                return;
            }

            const guessDriver = dailySession.driversList.find(driver => driver.id === normalizedDriverId);
            if (!guessDriver) {
                socket.emit('errorMessage', 'Pilotul ales nu este valid pentru Daily Challenge.');
                return;
            }

            dailySession.attempts++;

            const target = dailySession.targetDriver;
            const results = compareGuess(guessDriver, target);
            const isCorrectGuess = guessDriver.id === target.id;
            const isGameOver = isCorrectGuess || dailySession.attempts >= MAX_ATTEMPTS;

            if (isGameOver) {
                dailySession.finished = true;
            }

            const responseData = {
                guess: guessDriver,
                results,
                attempts: dailySession.attempts,
                isCorrect: isCorrectGuess,
                isGameOver,
                isDailyChallenge: true,
                dailyDate: dailySession.dailyDate,
                dailyChallengeId: dailySession.dailyChallengeId,
                difficulty: dailySession.difficulty
            };

            if (isGameOver) {
                responseData.target = { name: target.name };
            }

            socket.emit('dailyGuessResult', responseData);
        });


        socket.on('refreshAuthUser', (payload = {}) => {
            const room = currentRoom ? roomStore.get(currentRoom) : null;
            const socketAuthToken = payload && typeof payload === 'object'
                ? payload.socketAuthToken
                : null;
            const authUser = socketAuthToken
                ? sessionService.getUserBySocketAuthToken(socketAuthToken)
                : null;

            socket.user = authUser;

            if (socketAuthToken && !authUser) {
                socket.emit('authRefreshFailed');
            }

            if (!room) return;

            const member = refreshRoomMemberAuth(room, socket.id, authUser);
            if (!member) return;

            emitHostStatus(socket, room);
            emitRoomStateUpdate(currentRoom, 'auth-updated');
            emitRoomRoleStatuses(room);
        });

        function leaveCurrentRoom() {
            dailySessions.delete(socket.id);
            if (!currentRoom) return;

            const roomId = currentRoom;
            const room = roomStore.get(roomId);

            if (!room) {
                currentRoom = null;
                socket.leave(roomId);
                return;
            }

            if (hasRoomMember(room, socket.id) && room.roundState === 'playing' && !isSpectator(room, socket.id)) {
                const result = abortDuelRound(room, 'player-aborted');
                roomStore.markDirty?.();
                io.to(roomId).emit('duelAborted', {
                    message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
                    roundResult: result,
                    room: buildPublicRoomState(room),
                    liveBoard: buildLiveBoardState(room)
                });
                emitRoomStateUpdate(roomId, 'duel-aborted');
                return;
            }

            currentRoom = null;
            socket.leave(roomId);

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

        socket.on('abortDuelRound', () => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Spectatorii nu pot opri runda de duel.');
                return;
            }

            if (room.roundState !== 'playing') {
                socket.emit('errorMessage', 'Nu există o rundă activă de oprit.');
                return;
            }

            const result = abortDuelRound(room, 'player-aborted');
            roomStore.markDirty?.();
            io.to(currentRoom).emit('duelAborted', {
                message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
                roundResult: result,
                room: buildPublicRoomState(room),
                liveBoard: buildLiveBoardState(room)
            });
            emitRoomStateUpdate(currentRoom, 'duel-aborted');
        });

        function markCurrentRoomDisconnected() {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            markRoomMemberDisconnectedBySocketId(room, socket.id);
            roomStore.markDirty?.();
            emitRoomStateUpdate(currentRoom, 'disconnect');
        }

        socket.on('leaveRoom', leaveCurrentRoom);
        socket.on('disconnecting', markCurrentRoomDisconnected);
        socket.on('disconnect', () => {
            singleSessions.delete(socket.id);
            markCurrentRoomDisconnected();
        });
    });
}

module.exports = {
    registerSocketHandlers
};
