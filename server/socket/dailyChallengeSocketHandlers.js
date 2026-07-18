const { MAX_ATTEMPTS } = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const { recordAccountGameResultSafely } = require('../account/accountStatsService');
const {
    normalizeDriverId,
    normalizeRoundOptions
} = require('./socketPayloadValidators');

function createDailySession(dailyPayload) {
    return {
        difficulty: dailyPayload.difficulty,
        driversList: dailyPayload.drivers,
        targetDriver: dailyPayload.targetDriver,
        attempts: 0,
        finished: false,
        dailyDate: dailyPayload.dailyDate,
        dailyChallengeId: dailyPayload.dailyChallengeId
    };
}

function buildDailyInitPayload(dailyPayload) {
    return {
        drivers: dailyPayload.drivers,
        difficulty: dailyPayload.difficulty,
        timed: false,
        timeLimitSeconds: null,
        roundStartedAt: dailyPayload.roundStartedAt,
        isDailyChallenge: true,
        dailyDate: dailyPayload.dailyDate,
        dailyChallengeId: dailyPayload.dailyChallengeId
    };
}

function registerDailyChallengeSocketHandlers({
    socket,
    dailySessions,
    singleSessions,
    gameService,
    leaveCurrentRoom,
    accountStatsService = null,
    logger = console,
    onSocketEvent = socket.on.bind(socket)
}) {
    function recordResult(dailySession, outcome) {
        const userId = socket.user?.id;
        recordAccountGameResultSafely({
            accountStatsService,
            logger,
            userId,
            mode: 'daily',
            resultKey: dailySession.dailyChallengeId,
            outcome,
            attempts: dailySession.attempts,
            difficulty: dailySession.difficulty
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
    }

    onSocketEvent('startDailyChallenge', (payload) => {
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

        leaveCurrentRoom();
        singleSessions.delete(socket.id);

        dailySessions.set(socket.id, createDailySession(dailyPayload));
        socket.emit('initDailyChallenge', buildDailyInitPayload(dailyPayload));
    });

    onSocketEvent('submitDailyGuess', (driverId) => {
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
        if (isGameOver) recordResult(dailySession, isCorrectGuess ? 'win' : 'loss');
    });
}

module.exports = {
    createDailySession,
    buildDailyInitPayload,
    registerDailyChallengeSocketHandlers
};
