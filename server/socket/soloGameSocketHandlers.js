const { MAX_ATTEMPTS } = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const {
    buildAccountStatsSocketPayload,
    createGameResultKey,
    recordAccountGameResultSafely
} = require('../account/accountStatsService');
const {
    normalizeDriverId,
    normalizeRoundOptions,
    normalizeRestartOptions
} = require('./socketPayloadValidators');

function createSingleSession(roundPayload) {
    return {
        difficulty: roundPayload.difficulty,
        driversList: roundPayload.drivers,
        targetDriver: roundPayload.targetDriver,
        attempts: 0,
        finished: false,
        timed: roundPayload.timed,
        timeLimitSeconds: roundPayload.timeLimitSeconds,
        roundStartedAt: roundPayload.roundStartedAt,
        resultKey: createGameResultKey('single')
    };
}

function buildSingleInitPayload(roundPayload) {
    return {
        drivers: roundPayload.drivers,
        difficulty: roundPayload.difficulty,
        timed: roundPayload.timed,
        timeLimitSeconds: roundPayload.timeLimitSeconds,
        roundStartedAt: roundPayload.roundStartedAt,
        isDailyChallenge: false,
        isSinglePlay: true,
        dailyDate: null
    };
}

function registerSoloGameSocketHandlers({
    socket,
    singleSessions,
    gameService,
    leaveCurrentRoom,
    accountStatsService = null,
    logger = console,
    onSocketEvent = socket.on.bind(socket)
}) {
    function recordResult(singleSession, outcome) {
        const userId = socket.user?.id;
        recordAccountGameResultSafely({
            accountStatsService,
            logger,
            userId,
            mode: 'single',
            resultKey: singleSession.resultKey,
            outcome,
            attempts: singleSession.attempts,
            difficulty: singleSession.difficulty
        }).then(result => {
            if (result?.stats) {
                socket.emit('accountStatsUpdated', buildAccountStatsSocketPayload(userId, result));
            }
        });
    }

    onSocketEvent('startSingleGame', async (payload) => {
        const roundOptions = normalizeRoundOptions(payload);
        if (!roundOptions) {
            socket.emit('errorMessage', 'Dificultatea selectată nu este validă.');
            return;
        }

        await leaveCurrentRoom();

        const singlePayload = gameService.startSingleRound(roundOptions);
        if (!singlePayload) {
            socket.emit('errorMessage', 'Nu am putut porni jocul single pentru dificultatea selectată.');
            return;
        }

        singleSessions.set(socket.id, createSingleSession(singlePayload));
        socket.emit('initGame', buildSingleInitPayload(singlePayload));
    });

    onSocketEvent('submitSingleGuess', (driverId) => {
        const singleSession = singleSessions.get(socket.id);
        if (!singleSession || singleSession.finished) return;

        if (singleSession.attempts >= MAX_ATTEMPTS) return;

        if (singleSession.timed && singleSession.roundStartedAt && Date.now() - singleSession.roundStartedAt >= singleSession.timeLimitSeconds * 1000) {
            singleSession.attempts = MAX_ATTEMPTS;
            singleSession.finished = true;
            socket.emit('gameTimedOut', { target: { name: singleSession.targetDriver.name }, attempts: MAX_ATTEMPTS });
            recordResult(singleSession, 'loss');
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
        if (isGameOver) recordResult(singleSession, isCorrectGuess ? 'win' : 'loss');
    });

    onSocketEvent('restartSingleGame', (payload = {}) => {
        const previousSession = singleSessions.get(socket.id);
        const restartPayload = gameService.restartSingleRound(previousSession, normalizeRestartOptions(payload));
        if (!restartPayload) {
            socket.emit('errorMessage', 'Nu am putut reporni jocul single. Alege mai întâi o dificultate.');
            return;
        }

        singleSessions.set(socket.id, createSingleSession(restartPayload));
        socket.emit('gameRestarted', buildSingleInitPayload(restartPayload));
    });
}

module.exports = {
    createSingleSession,
    buildSingleInitPayload,
    registerSoloGameSocketHandlers
};
