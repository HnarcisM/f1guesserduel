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

module.exports = {
    normalizeJoinRoomPayload,
    buildPlayerProgressPayload
};
