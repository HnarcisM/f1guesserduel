const { normalizeTimeLimitSeconds, isValidDifficulty } = require('../config/constants');
const { resetPlayersForNewRound, syncScoreboardWithPlayers } = require('../rooms/roomService');
const { pickDailyDriver } = require('./dailyChallenge');

function createGameService(driversRepository) {
    function pickRandomDriver(drivers) {
        return drivers[Math.floor(Math.random() * drivers.length)];
    }

    function buildDailyChallenge(difficulty, date = new Date()) {
        if (!isValidDifficulty(difficulty)) return null;

        const drivers = driversRepository.getDriversByDifficulty(difficulty);
        if (drivers.length === 0) return null;

        const dailyChallenge = pickDailyDriver(drivers, difficulty, date);
        if (!dailyChallenge) return null;

        return {
            drivers,
            difficulty,
            targetDriver: dailyChallenge.driver,
            dailyDate: dailyChallenge.dateKey,
            dailyChallengeId: dailyChallenge.challengeId
        };
    }

    function startDailyChallenge(difficulty, date = new Date()) {
        const dailyChallenge = buildDailyChallenge(difficulty, date);
        if (!dailyChallenge) return null;

        return {
            drivers: dailyChallenge.drivers,
            difficulty: dailyChallenge.difficulty,
            targetDriver: dailyChallenge.targetDriver,
            dailyDate: dailyChallenge.dailyDate,
            dailyChallengeId: dailyChallenge.dailyChallengeId,
            timed: false,
            timeLimitSeconds: null,
            roundStartedAt: Date.now(),
            isDailyChallenge: true
        };
    }


    function startSingleRound(options) {
        const difficulty = options && options.difficulty;
        if (!isValidDifficulty(difficulty)) return null;

        const drivers = driversRepository.getDriversByDifficulty(difficulty);
        if (drivers.length === 0) return null;

        const timed = Boolean(options.timed);
        const timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);

        return {
            drivers,
            difficulty,
            targetDriver: pickRandomDriver(drivers),
            attempts: 0,
            finished: false,
            timed,
            timeLimitSeconds,
            roundStartedAt: Date.now(),
            isSinglePlay: true
        };
    }

    function restartSingleRound(singleSession, options = {}) {
        if (!singleSession || !singleSession.difficulty) return null;
        return startSingleRound({
            difficulty: singleSession.difficulty,
            timed: Boolean(options.timed),
            timeLimitSeconds: options.timeLimitSeconds
        });
    }

    function startNewRound(room, options) {
        const difficulty = options && options.difficulty;
        if (!isValidDifficulty(difficulty)) return null;

        const drivers = driversRepository.getDriversByDifficulty(difficulty);
        if (drivers.length === 0) return null;

        room.difficulty = difficulty;
        room.driversList = drivers;
        room.targetDriver = pickRandomDriver(drivers);
        room.isDailyChallenge = false;
        room.dailyDate = null;
        room.dailyChallengeId = null;
        resetPlayersForNewRound(room);
        syncScoreboardWithPlayers(room);
        room.timed = Boolean(options.timed);
        room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
        room.roundStartedAt = Date.now();
        room.roundState = 'playing';
        room.roundResult = null;

        return {
            drivers,
            difficulty,
            timed: room.timed,
            timeLimitSeconds: room.timeLimitSeconds,
            roundStartedAt: room.roundStartedAt,
            isDailyChallenge: false,
            dailyDate: null
        };
    }

    function restartRound(room, options = {}) {
        if (!room || !room.difficulty) return null;

        const drivers = driversRepository.getDriversByDifficulty(room.difficulty);
        if (drivers.length === 0) return null;

        room.driversList = drivers;
        room.targetDriver = pickRandomDriver(drivers);
        room.isDailyChallenge = false;
        room.dailyDate = null;
        room.dailyChallengeId = null;
        resetPlayersForNewRound(room);
        syncScoreboardWithPlayers(room);
        room.timed = Boolean(options.timed);
        room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
        room.roundStartedAt = Date.now();
        room.roundState = 'playing';
        room.roundResult = null;

        return {
            timed: room.timed,
            timeLimitSeconds: room.timeLimitSeconds,
            roundStartedAt: room.roundStartedAt,
            isDailyChallenge: false,
            dailyDate: null
        };
    }

    return {
        startNewRound,
        restartRound,
        startDailyChallenge,
        startSingleRound,
        restartSingleRound
    };
}

module.exports = {
    createGameService
};
