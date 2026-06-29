const DEFAULT_TIME_LIMIT_SECONDS = 60;
const ALLOWED_TIME_LIMIT_SECONDS = [60, 90, 120];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard', 'all'];
const MAX_PLAYERS_PER_ROOM = 2;
const MAX_ATTEMPTS = 6;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

function normalizeTimeLimitSeconds(value) {
    const seconds = Number(value);
    return ALLOWED_TIME_LIMIT_SECONDS.includes(seconds) ? seconds : DEFAULT_TIME_LIMIT_SECONDS;
}

function isValidDifficulty(difficulty) {
    return ALLOWED_DIFFICULTIES.includes(difficulty);
}

function isValidRoomId(roomId) {
    return typeof roomId === 'string' && ROOM_ID_PATTERN.test(roomId);
}

module.exports = {
    DEFAULT_TIME_LIMIT_SECONDS,
    ALLOWED_TIME_LIMIT_SECONDS,
    ALLOWED_DIFFICULTIES,
    MAX_PLAYERS_PER_ROOM,
    MAX_ATTEMPTS,
    ROOM_ID_PATTERN,
    normalizeTimeLimitSeconds,
    isValidDifficulty,
    isValidRoomId
};
