const { MAX_ATTEMPTS } = require('../config/constants');
const { compareGuess } = require('../game/compareDriver');
const {
    buildAccountStatsSocketPayload,
    recordAccountGameResultSafely
} = require('../account/accountStatsService');
const { getDailyDateKey, getNextDailyResetAt } = require('../game/dailyChallenge');
const {
    normalizeDriverId,
    normalizeRoundOptions
} = require('./socketPayloadValidators');

function createDailySession(dailyPayload, userId) {
    return {
        userId,
        difficulty: dailyPayload.difficulty,
        driversList: dailyPayload.drivers,
        targetDriver: dailyPayload.targetDriver,
        attempts: 0,
        finished: false,
        dailyDate: dailyPayload.dailyDate,
        dailyChallengeId: dailyPayload.dailyChallengeId,
        roundStartedAt: dailyPayload.roundStartedAt
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
        dailyChallengeId: dailyPayload.dailyChallengeId,
        nextResetAt: dailyPayload.nextResetAt || null
    };
}

function buildDailyStatusPayload({ authenticated, dailyDate, nextResetAt, claimedDifficulties = [] }) {
    return {
        authenticated: Boolean(authenticated),
        dailyDate,
        nextResetAt,
        claimedDifficulties: Array.isArray(claimedDifficulties) ? claimedDifficulties : []
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
    now = () => new Date(),
    onSocketEvent = socket.on.bind(socket),
    clock = Date.now
}) {
    function getCurrentDailyContext() {
        const currentDate = now();
        return {
            currentDate,
            dailyDate: getDailyDateKey(currentDate),
            nextResetAt: getNextDailyResetAt(currentDate)
        };
    }

    async function emitDailyStatus() {
        const { dailyDate, nextResetAt } = getCurrentDailyContext();
        const userId = socket.user?.id;
        if (!userId) {
            const payload = buildDailyStatusPayload({ authenticated: false, dailyDate, nextResetAt });
            socket.emit('dailyChallengeStatus', payload);
            return payload;
        }

        try {
            const status = await accountStatsService.getDailyChallengeStatus(userId, dailyDate);
            const payload = buildDailyStatusPayload({
                authenticated: true,
                dailyDate,
                nextResetAt,
                claimedDifficulties: status.claimedDifficulties
            });
            socket.emit('dailyChallengeStatus', payload);
            return payload;
        } catch (error) {
            logger?.error?.('Daily Challenge status lookup failed.', { error, dailyDate });
            socket.emit('dailyChallengeError', 'Nu am putut verifica disponibilitatea Daily Challenge. Încearcă din nou.');
            return null;
        }
    }

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
            difficulty: dailySession.difficulty,
            targetDriver: dailySession.targetDriver,
            durationMs: Number.isFinite(dailySession.roundStartedAt)
                ? Math.max(0, clock() - dailySession.roundStartedAt)
                : null,
            matchId: dailySession.dailyChallengeId,
            winnerUsername: outcome === 'win' ? socket.user?.username || null : null
        }).then(result => {
            if (result?.stats) {
                socket.emit('accountStatsUpdated', buildAccountStatsSocketPayload(userId, result));
            }
        });
    }

    onSocketEvent('requestDailyChallengeStatus', emitDailyStatus);

    onSocketEvent('startDailyChallenge', async (payload) => {
        const dailyOptions = normalizeRoundOptions(payload);
        if (!dailyOptions) {
            socket.emit('dailyChallengeError', 'Dificultatea Daily Challenge nu este validă.');
            return;
        }

        const userId = socket.user?.id;
        if (!userId) {
            socket.emit('dailyChallengeError', 'Autentifică-te pentru a juca Daily Challenge și a salva progresul.');
            return;
        }

        if (!accountStatsService?.claimDailyChallenge) {
            socket.emit('dailyChallengeError', 'Daily Challenge nu este disponibil momentan. Încearcă din nou mai târziu.');
            return;
        }

        const { currentDate, dailyDate, nextResetAt } = getCurrentDailyContext();
        const dailyPayload = gameService.startDailyChallenge(dailyOptions.difficulty, currentDate);
        if (!dailyPayload) {
            socket.emit('dailyChallengeError', 'Nu am putut porni Daily Challenge pentru dificultatea selectată.');
            return;
        }

        dailyPayload.nextResetAt = nextResetAt;

        try {
            const claimed = await accountStatsService.claimDailyChallenge({
                userId,
                challengeId: dailyPayload.dailyChallengeId,
                dailyDate,
                difficulty: dailyOptions.difficulty
            });
            if (!claimed) {
                await emitDailyStatus();
                socket.emit('dailyChallengeError', 'Ai folosit deja încercarea Daily pentru această dificultate. Revine la următorul reset.');
                return;
            }
        } catch (error) {
            logger?.error?.('Daily Challenge claim failed.', {
                error,
                dailyDate,
                difficulty: dailyOptions.difficulty
            });
            socket.emit('dailyChallengeError', 'Nu am putut rezerva încercarea Daily. Încearcă din nou.');
            return;
        }

        await leaveCurrentRoom();
        singleSessions.delete(socket.id);

        dailySessions.set(socket.id, createDailySession(dailyPayload, userId));
        socket.emit('initDailyChallenge', buildDailyInitPayload(dailyPayload));
        await emitDailyStatus();
    });

    onSocketEvent('submitDailyGuess', (driverId) => {
        const dailySession = dailySessions.get(socket.id);
        if (!dailySession || dailySession.finished) return;

        if (!socket.user?.id || String(socket.user.id) !== String(dailySession.userId)) {
            dailySessions.delete(socket.id);
            socket.emit('dailyChallengeError', 'Sesiunea Daily necesită autentificarea contului care a pornit-o.');
            return;
        }

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
    buildDailyStatusPayload,
    registerDailyChallengeSocketHandlers
};
