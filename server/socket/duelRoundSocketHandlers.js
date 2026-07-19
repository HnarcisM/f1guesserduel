const { MAX_ATTEMPTS } = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const {
    updateDuelLobbySettings,
    getPlayer,
    isHost,
    isSpectator,
    recordPlayerGuess,
    markPlayerTimedOut,
    buildLiveBoardState,
    buildPersonalRoundResult,
    buildPublicRoomState,
    resolveRoundWinner,
    abortDuelRound
} = require('../rooms/roomService');
const {
    normalizeDriverId,
    normalizeRoundOptions,
    normalizeRestartOptions
} = require('./socketPayloadValidators');
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

function buildAccountStatsPayload(userId, result) {
    return {
        userId,
        stats: result.stats,
        recentGames: result.recentGames || [],
        progress: result.progress || null,
        achievements: result.achievements || [],
        xpAwarded: Number(result.xpAwarded) || 0
    };
}

function registerDuelRoundSocketHandlers(context) {
    const {
        io,
        socket,
        state,
        roomStore,
        gameService,
        singleSessions,
        accountStatsService,
        logger,
        onSocketEvent,
        getActiveRoomSockets,
        emitGameStateToActiveRoomMembers,
        emitRoomStateUpdate,
        emitRoomListUpdate
    } = context;

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
                    playerSocket.emit('accountStatsUpdated', buildAccountStatsPayload(accountResult.userId, result));
                }
            });
        }

        for (const memberSocket of getActiveRoomSockets(room)) {
            const member = room.players?.[memberSocket.id] || room.spectators?.[memberSocket.id] || null;
            const payload = buildPersonalRoundResult(roundResult, member);
            if (!payload) continue;
            if (isSpectator(room, memberSocket.id)) payload.liveBoard = buildLiveBoardState(room);
            memberSocket.emit('roundResolved', payload);
        }

        emitRoomStateUpdate(roomId, 'round-resolved');
        emitRoomListUpdate();
    }

    onSocketEvent('setDifficulty', (payload) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
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

        emitGameStateToActiveRoomMembers(roomId, 'initGame', initPayload, {
            includeLiveBoardForSpectators: true
        });
        emitRoomStateUpdate(roomId, 'round-started');
        emitRoomListUpdate();
    });

    onSocketEvent('submitGuess', (driverId) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
        if (!room) return;
        if (isSpectator(room, socket.id)) {
            socket.emit('errorMessage', 'Ești spectator în această cameră. Poți urmări jocul, dar nu poți trimite încercări.');
            return;
        }

        const player = getPlayer(room, socket.id);
        if (!player || !room.targetDriver || room.roundState !== 'playing' || player.finished) return;

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
            if (roundResult && !hadRoundResult) emitRoundResolved(roomId, room, roundResult);
            else emitRoomStateUpdate(roomId, roundResult ? 'round-progress' : 'timeout');
            return;
        }

        if (typeof player.attempts !== 'number') player.attempts = 0;
        if (player.attempts >= MAX_ATTEMPTS) return;

        const normalizedDriverId = normalizeDriverId(driverId);
        const guessDriver = normalizedDriverId
            ? room.driversList.find(driver => driver.id === normalizedDriverId)
            : null;
        if (!guessDriver) {
            socket.emit('errorMessage', 'Pilotul ales nu este valid pentru runda curentă.');
            return;
        }

        player.attempts += 1;
        const target = room.targetDriver;
        const results = compareGuess(guessDriver, target);
        const isCorrectGuess = guessDriver.id === target.id;
        const isGameOver = isCorrectGuess || player.attempts >= MAX_ATTEMPTS;
        if (isGameOver) player.finished = true;

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
        if (isGameOver) responseData.target = { name: target.name };
        socket.emit('guessResult', responseData);

        if (roundResult && !hadRoundResult) emitRoundResolved(roomId, room, roundResult);
        else emitRoomStateUpdate(roomId, roundResult ? 'round-progress' : 'guess');
    });

    onSocketEvent('timeExpired', () => {
        const roomId = state.currentRoom;
        if (!roomId) {
            const singleSession = singleSessions.get(socket.id);
            if (!singleSession || singleSession.finished || !singleSession.timed || !singleSession.roundStartedAt) return;
            if (Date.now() - singleSession.roundStartedAt < singleSession.timeLimitSeconds * 1000 - 500) return;

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
                    socket.emit('accountStatsUpdated', buildAccountStatsPayload(userId, result));
                }
            });
            return;
        }

        const room = roomStore.get(roomId);
        if (!room || isSpectator(room, socket.id)) return;
        const player = getPlayer(room, socket.id);
        if (!player || !room.targetDriver || !room.timed || !room.roundStartedAt || player.finished) return;
        if (Date.now() - room.roundStartedAt < room.timeLimitSeconds * 1000 - 500) return;

        player.attempts = MAX_ATTEMPTS;
        markPlayerTimedOut(player);
        const hadRoundResult = Boolean(room.roundResult);
        const roundResult = resolveRoundWinner(room, 'timeout');
        socket.emit('gameTimedOut', {
            target: { name: room.targetDriver.name },
            attempts: MAX_ATTEMPTS,
            roundResult: roundResult ? buildPersonalRoundResult(roundResult, player) : null
        });
        if (roundResult && !hadRoundResult) emitRoundResolved(roomId, room, roundResult);
        else emitRoomStateUpdate(roomId, roundResult ? 'round-progress' : 'timeout');
    });

    onSocketEvent('restartGame', (payload = {}) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
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

        emitGameStateToActiveRoomMembers(roomId, 'gameRestarted', restartPayload, {
            includeLiveBoardForSpectators: true
        });
        emitRoomStateUpdate(roomId, 'restart');
        emitRoomListUpdate();
    });

    onSocketEvent('abortDuelRound', () => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
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
        roomStore.markDirty?.(roomId);
        io.to(roomId).emit('duelAborted', {
            message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
            roundResult: result,
            room: buildPublicRoomState(room),
            liveBoard: buildLiveBoardState(room)
        });
        emitRoomStateUpdate(roomId, 'duel-aborted');
        emitRoomListUpdate();
    });
}

module.exports = {
    buildDuelAccountResults,
    registerDuelRoundSocketHandlers
};
