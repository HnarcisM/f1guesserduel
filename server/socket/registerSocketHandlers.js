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
    selectSpectatorAsPlayer,
    updateDuelLobbySettings,
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
const {
    normalizeJoinRoomPayload,
    buildPlayerProgressPayload
} = require('./socketRoomPayloads');
const { registerSoloGameSocketHandlers } = require('./soloGameSocketHandlers');
const { registerDailyChallengeSocketHandlers } = require('./dailyChallengeSocketHandlers');
const { createSocketEventRateLimiter } = require('./socketEventRateLimit');
const { buildPublicRoomListPayload } = require('./roomListPayloads');
const { recordAccountGameResultSafely } = require('../account/accountStatsService');

function buildDuelAccountResults(roomId, room, roundResult) {
    if (!room || !roundResult) return [];

    return Object.values(room.players || {})
        .filter(player => player.userId !== null && player.userId !== undefined)
        .map(player => ({
            userId: player.userId,
            mode: 'duel',
            resultKey: `${roomId}:${room.roundStartedAt}`,
            outcome: roundResult.status === 'draw'
                ? 'draw'
                : roundResult.winnerSocketId === player.socketId ? 'win' : 'loss',
            attempts: typeof player.attempts === 'number' ? player.attempts : 0,
            difficulty: room.difficulty,
            socketId: player.socketId
        }));
}

function registerSocketHandlers(io, dependencies) {
    const {
        roomStore,
        gameService,
        sessionService,
        accountStatsService = null,
        logger = console
    } = dependencies;
    const dailySessions = new Map();
    const singleSessions = new Map();
    const socketEventRateLimiter = createSocketEventRateLimiter(dependencies.socketRateLimit);

    attachSocketAuth(io, sessionService);

    const {
        cleanupInactiveMembers,
        emitGameStateToActiveRoomMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        getActiveRoomSockets
    } = createRoomStateEmitter(io, roomStore);

    function cleanupRoomsBeforeList() {
        if (typeof roomStore?.values !== 'function') return;

        for (const room of roomStore.values()) {
            if (!room?.roomId) continue;
            cleanupInactiveMembers(room.roomId, room);
        }
    }

    function emitRoomListUpdate(target = io) {
        cleanupRoomsBeforeList();
        const payload = buildPublicRoomListPayload(roomStore);
        if (typeof target?.emit === 'function') {
            target.emit('roomListUpdate', payload);
        }
        return payload;
    }

    function emitRoundResolved(roomId, room, roundResult) {
        if (!room || !roundResult) return;
        roomStore.markDirty?.(roomId);

        for (const accountResult of buildDuelAccountResults(roomId, room, roundResult)) {
            recordAccountGameResultSafely({
                accountStatsService,
                logger,
                ...accountResult
            }).then(result => {
                const playerSocket = io.sockets?.sockets?.get?.(accountResult.socketId);
                if (result?.stats && playerSocket) {
                    playerSocket.emit('accountStatsUpdated', {
                        userId: accountResult.userId,
                        stats: result.stats,
                        recentGames: result.recentGames || [],
                        progress: result.progress || null,
                        achievements: result.achievements || [],
                        xpAwarded: Number(result.xpAwarded) || 0
                    });
                }
            });
        }

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
        emitRoomListUpdate();
    }

    io.on('connection', (socket) => {
        let currentRoom = null;
        let hasMarkedCurrentRoomDisconnected = false;

        function onSocketEvent(eventName, handler) {
            socketEventRateLimiter.register(socket, eventName, handler);
        }

        function clearSoloModeSessions() {
            singleSessions.delete(socket.id);
            dailySessions.delete(socket.id);
        }

        onSocketEvent('requestRoomList', () => {
            emitRoomListUpdate(socket);
        });

        onSocketEvent('joinRoom', (payload) => {
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
            roomStore.markDirty?.(roomId);

            if (!joinResult || !joinResult.joined) {
                socket.emit('roomFull', { maxPlayers: MAX_PLAYERS_PER_ROOM });
                return;
            }

            clearSoloModeSessions();

            currentRoom = roomId;
            hasMarkedCurrentRoomDisconnected = false;
            socket.join(roomId);
            emitHostStatus(socket, room);
            emitRoomStateUpdate(roomId, 'join');
            emitRoomListUpdate();

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


        onSocketEvent('updateDuelLobbySettings', (payload) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Ești spectator. Doar hostul poate modifica setările din lobby.');
                return;
            }

            if (!isHost(room, socket.id)) {
                socket.emit('errorMessage', 'Doar hostul camerei poate modifica setările din lobby.');
                return;
            }

            if (room.roundState === 'playing') {
                socket.emit('errorMessage', 'Setările pot fi schimbate doar în lobby, după finalul rundei.');
                return;
            }

            const roundOptions = normalizeRoundOptions(payload);
            if (!roundOptions) {
                socket.emit('errorMessage', 'Setările selectate nu sunt valide.');
                return;
            }

            updateDuelLobbySettings(room, roundOptions);
            roomStore.markDirty?.(currentRoom);
            emitRoomStateUpdate(currentRoom, 'lobby-settings-updated');
            emitRoomListUpdate();
        });

        onSocketEvent('setDifficulty', (payload) => {
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

            updateDuelLobbySettings(room, roundOptions);
            const initPayload = gameService.startNewRound(room, roundOptions);
            if (!initPayload) {
                socket.emit('errorMessage', 'Nu am putut porni runda pentru dificultatea selectată.');
                return;
            }

            emitGameStateToActiveRoomMembers(currentRoom, 'initGame', initPayload, {
                includeLiveBoardForSpectators: true
            });
            emitRoomStateUpdate(currentRoom, 'round-started');
            emitRoomListUpdate();
        });

        onSocketEvent('submitGuess', (driverId) => {
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

        onSocketEvent('timeExpired', () => {
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
                const userId = socket.user?.id;
                recordAccountGameResultSafely({
                    accountStatsService,
                    logger,
                    userId,
                    mode: 'single',
                    resultKey: singleSession.resultKey,
                    outcome: 'loss',
                    attempts: MAX_ATTEMPTS,
                    difficulty: singleSession.difficulty
                }).then(result => {
                    if (result?.stats) {
                        socket.emit('accountStatsUpdated', {
                            userId,
                            stats: result.stats,
                            recentGames: result.recentGames || [],
                            progress: result.progress || null,
                            achievements: result.achievements || [],
                            xpAwarded: Number(result.xpAwarded) || 0
                        });
                    }
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

        onSocketEvent('selectDuelPlayer', (payload = {}) => {
            if (!currentRoom) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            if (isSpectator(room, socket.id)) {
                socket.emit('errorMessage', 'Spectatorii pot vedea lobby-ul, dar nu pot schimba jucătorii.');
                return;
            }

            if (!isHost(room, socket.id)) {
                socket.emit('errorMessage', 'Doar hostul poate schimba jucătorii activi.');
                return;
            }

            if (room.roundState === 'playing') {
                socket.emit('errorMessage', 'Nu poți schimba jucătorii în timpul rundei. Oprește runda sau așteaptă finalul.');
                return;
            }

            const lobbyId = payload && typeof payload === 'object' && typeof payload.lobbyId === 'string'
                ? payload.lobbyId
                : null;
            const result = selectSpectatorAsPlayer(room, lobbyId);

            if (!result.changed) {
                socket.emit('errorMessage', 'Nu am putut schimba jucătorul selectat. Verifică dacă spectatorul mai este în lobby.');
                return;
            }

            roomStore.markDirty?.(currentRoom);
            emitRoomRoleStatuses(room);
            emitRoomStateUpdate(currentRoom, 'player-selected');
            emitRoomListUpdate();
        });

        onSocketEvent('restartGame' , (payload = {}) => {
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
            emitRoomListUpdate();
        });


        registerSoloGameSocketHandlers({
            socket,
            singleSessions,
            gameService,
            leaveCurrentRoom,
            accountStatsService,
            logger,
            onSocketEvent
        });
        registerDailyChallengeSocketHandlers({
            socket,
            dailySessions,
            singleSessions,
            gameService,
            leaveCurrentRoom,
            accountStatsService,
            logger,
            onSocketEvent
        });
        onSocketEvent('refreshAuthUser', async (payload = {}) => {
            const room = currentRoom ? roomStore.get(currentRoom) : null;
            const socketAuthToken = payload && typeof payload === 'object'
                ? payload.socketAuthToken
                : null;
            const authUser = socketAuthToken
                ? await sessionService.getUserBySocketAuthToken(socketAuthToken)
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
            emitRoomListUpdate();
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
                roomStore.markDirty?.(roomId);
                io.to(roomId).emit('duelAborted', {
                    message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
                    roundResult: result,
                    room: buildPublicRoomState(room),
                    liveBoard: buildLiveBoardState(room)
                });
                emitRoomStateUpdate(roomId, 'duel-aborted');
                emitRoomListUpdate();
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
                emitRoomListUpdate();
                return;
            }

            emitRoomStateUpdate(roomId, 'leave');
            emitRoomRoleStatuses(room);
            emitRoomListUpdate();
        }

        onSocketEvent('abortDuelRound', () => {
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
            roomStore.markDirty?.(currentRoom);
            io.to(currentRoom).emit('duelAborted', {
                message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
                roundResult: result,
                room: buildPublicRoomState(room),
                liveBoard: buildLiveBoardState(room)
            });
            emitRoomStateUpdate(currentRoom, 'duel-aborted');
            emitRoomListUpdate();
        });

        function markCurrentRoomDisconnected() {
            if (!currentRoom || hasMarkedCurrentRoomDisconnected) return;

            const room = roomStore.get(currentRoom);
            if (!room) return;

            const disconnectedMember = markRoomMemberDisconnectedBySocketId(room, socket.id);
            if (!disconnectedMember) return;

            hasMarkedCurrentRoomDisconnected = true;
            roomStore.markDirty?.(currentRoom);
            emitRoomStateUpdate(currentRoom, 'disconnect');
            emitRoomListUpdate();
        }

        socket.on('leaveRoom', leaveCurrentRoom);
        socket.on('disconnecting', markCurrentRoomDisconnected);
        socket.on('disconnect', () => {
            clearSoloModeSessions();
            markCurrentRoomDisconnected();
            socketEventRateLimiter.clearSocket(socket.id);
        });
    });
}

module.exports = {
    buildDuelAccountResults,
    registerSocketHandlers
};
