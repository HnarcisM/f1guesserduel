const DAILY_CHALLENGE_VERSION = 'f1-daily-v1';

function getDailyDateKey(date = new Date()) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
    }

    const source = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(source.getTime())) {
        return getDailyDateKey(new Date());
    }

    return source.toISOString().slice(0, 10);
}

function hashString(value) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function getDailyChallengeId(difficulty, dateKey = getDailyDateKey()) {
    return `${DAILY_CHALLENGE_VERSION}:${dateKey}:${difficulty}`;
}

function pickDailyDriver(drivers, difficulty, date = new Date()) {
    if (!Array.isArray(drivers) || drivers.length === 0) return null;

    const dateKey = getDailyDateKey(date);
    const seed = getDailyChallengeId(difficulty, dateKey);
    const index = hashString(seed) % drivers.length;

    return {
        driver: drivers[index],
        dateKey,
        challengeId: seed
    };
}

module.exports = {
    DAILY_CHALLENGE_VERSION,
    getDailyDateKey,
    getDailyChallengeId,
    pickDailyDriver
};
