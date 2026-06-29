const { normalizeTimeLimitSeconds, isValidDifficulty } = require('../config/constants');
const { resetPlayersForNewRound } = require('../rooms/roomService');

function createGameService(driversRepository) {
    function pickRandomDriver(drivers) {
        return drivers[Math.floor(Math.random() * drivers.length)];
    }

    function startNewRound(room, options) {
        const difficulty = options && options.difficulty;
        if (!isValidDifficulty(difficulty)) return null;

        const drivers = driversRepository.getDriversByDifficulty(difficulty);
        if (drivers.length === 0) return null;

        room.difficulty = difficulty;
        room.driversList = drivers;
        room.targetDriver = pickRandomDriver(drivers);
        resetPlayersForNewRound(room);
        room.timed = Boolean(options.timed);
        room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
        room.roundStartedAt = Date.now();
        room.roundState = 'playing';

        return {
            drivers,
            difficulty,
            timed: room.timed,
            timeLimitSeconds: room.timeLimitSeconds,
            roundStartedAt: room.roundStartedAt
        };
    }

    function restartRound(room, options = {}) {
        if (!room || !room.difficulty) return null;

        const drivers = driversRepository.getDriversByDifficulty(room.difficulty);
        if (drivers.length === 0) return null;

        room.driversList = drivers;
        room.targetDriver = pickRandomDriver(drivers);
        resetPlayersForNewRound(room);
        room.timed = Boolean(options.timed);
        room.timeLimitSeconds = normalizeTimeLimitSeconds(options.timeLimitSeconds);
        room.roundStartedAt = Date.now();
        room.roundState = 'playing';

        return {
            timed: room.timed,
            timeLimitSeconds: room.timeLimitSeconds,
            roundStartedAt: room.roundStartedAt
        };
    }

    return {
        startNewRound,
        restartRound
    };
}

module.exports = {
    createGameService
};
