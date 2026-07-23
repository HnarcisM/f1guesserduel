function getDuelRoundDurationMs(room, roundResult) {
    const resolvedAt = Number(roundResult?.finishedAt || roundResult?.resolvedAt);
    const roundStartedAt = Number(room?.roundStartedAt);
    return Number.isFinite(resolvedAt) && Number.isFinite(roundStartedAt)
        ? Math.max(0, resolvedAt - roundStartedAt)
        : null;
}

function buildDuelMatchId(roomId, room) {
    const matchStartedAt = Number(room?.matchState?.startedAt);
    const roundStartedAt = Number(room?.roundStartedAt);
    const matchAnchor = Number.isFinite(matchStartedAt)
        ? matchStartedAt
        : Number.isFinite(roundStartedAt) ? roundStartedAt : 'unknown';
    return `${roomId}:${matchAnchor}`;
}

function buildDuelAccountResults(roomId, room, roundResult) {
    if (!room || !roundResult) return [];

    const players = Object.values(room.players || {});
    const durationMs = getDuelRoundDurationMs(room, roundResult);
    const matchId = buildDuelMatchId(roomId, room);

    return players
        .filter(player => player.userId !== null && player.userId !== undefined)
        .map(player => {
            const opponent = players.find(candidate => candidate.socketId !== player.socketId) || null;
            return {
                userId: player.userId,
                mode: 'duel',
                resultKey: `${roomId}:${room.roundStartedAt}`,
                outcome: roundResult.status === 'draw'
                    ? 'draw'
                    : roundResult.winnerSocketId === player.socketId ? 'win' : 'loss',
                attempts: typeof player.attempts === 'number' ? player.attempts : 0,
                difficulty: room.difficulty,
                targetDriver: room.targetDriver,
                durationMs,
                roomId,
                matchId,
                opponentUsername: opponent?.username || null,
                winnerUsername: roundResult.winnerUsername || null,
                socketId: player.socketId
            };
        });
}

module.exports = {
    buildDuelAccountResults,
    buildDuelMatchId,
    getDuelRoundDurationMs
};
