function getActivePlayers(room) {
    return Object.values(room?.players || {});
}

function buildTargetSummary(room) {
    return room?.targetDriver ? { name: room.targetDriver.name } : null;
}

function getPlayerCorrect(player) {
    return Boolean(player?.correctGuess);
}

function getPlayerAttempts(player) {
    return typeof player?.attempts === 'number' ? player.attempts : 0;
}

function getPlayerCompletedAt(player) {
    return typeof player?.completedAt === 'number' ? player.completedAt : Number.MAX_SAFE_INTEGER;
}

function sortCorrectPlayers(a, b) {
    const attemptsDiff = getPlayerAttempts(a) - getPlayerAttempts(b);
    if (attemptsDiff !== 0) return attemptsDiff;
    return getPlayerCompletedAt(a) - getPlayerCompletedAt(b);
}

function getAllPlayersFinished(players) {
    return players.length > 0 && players.every(player => Boolean(player.finished));
}

function buildPlayerResult(player, winnerSocketId = null, isDraw = false) {
    const isWinner = Boolean(winnerSocketId && player.socketId === winnerSocketId);
    const isCorrect = getPlayerCorrect(player);
    let outcome = 'loss';

    if (isDraw) outcome = 'draw';
    else if (isWinner) outcome = 'win';
    else if (!player.finished) outcome = 'pending';

    return {
        username: player.username,
        role: player.role,
        isHost: Boolean(player.isHost),
        attempts: getPlayerAttempts(player),
        finished: Boolean(player.finished),
        timedOut: Boolean(player.timedOut),
        isCorrect,
        outcome
    };
}

function buildRoundPlayers(room, winnerSocketId = null, isDraw = false) {
    return getActivePlayers(room).map(player => buildPlayerResult(player, winnerSocketId, isDraw));
}

function refreshExistingRoundResult(room) {
    if (!room?.roundResult) return null;

    const players = getActivePlayers(room);
    const allPlayersFinished = getAllPlayersFinished(players);
    const isDraw = room.roundResult.status === 'draw';

    room.roundResult.players = buildRoundPlayers(room, room.roundResult.winnerSocketId || null, isDraw);
    room.roundResult.allPlayersFinished = allPlayersFinished;

    if (allPlayersFinished) {
        room.roundState = 'finished';
        room.roundResult.finishedAt = room.roundResult.finishedAt || Date.now();
    }

    return room.roundResult;
}

function buildPublicRoundResult(roundResult) {
    if (!roundResult) return null;

    return {
        status: roundResult.status,
        reason: roundResult.reason,
        winnerUsername: roundResult.winnerUsername || null,
        resolvedAt: roundResult.resolvedAt || null,
        finishedAt: roundResult.finishedAt || null,
        allPlayersFinished: Boolean(roundResult.allPlayersFinished),
        target: roundResult.target || null,
        players: Array.isArray(roundResult.players)
            ? roundResult.players.map(player => ({ ...player }))
            : []
    };
}

function resolveRoundWinner(room, reason = 'guess') {
    if (!room || room.roundState !== 'playing') return room?.roundResult || null;

    if (room.roundResult) {
        return refreshExistingRoundResult(room);
    }

    const players = getActivePlayers(room);
    if (players.length === 0) return null;

    const correctPlayers = players.filter(getPlayerCorrect).sort(sortCorrectPlayers);
    const allPlayersFinished = getAllPlayersFinished(players);
    const resolvedAt = Date.now();
    let winner = null;
    let status = null;
    let resultReason = reason;

    if (correctPlayers.length > 0) {
        winner = correctPlayers[0];
        status = 'win';
        resultReason = 'correct-guess';
    } else if (allPlayersFinished) {
        status = 'draw';
        resultReason = players.every(player => Boolean(player.timedOut)) ? 'all-timed-out' : 'no-correct-guess';
    }

    if (!status) return null;

    const winnerSocketId = winner?.socketId || null;
    const isDraw = status === 'draw';
    const result = {
        status,
        reason: resultReason,
        winnerSocketId,
        winnerUsername: winner?.username || null,
        resolvedAt,
        finishedAt: allPlayersFinished ? resolvedAt : null,
        allPlayersFinished,
        target: buildTargetSummary(room),
        players: buildRoundPlayers(room, winnerSocketId, isDraw)
    };

    room.roundResult = result;
    if (allPlayersFinished) {
        room.roundState = 'finished';
    }

    return result;
}

function buildPersonalRoundResult(roundResult, member = null) {
    if (!roundResult) return null;

    const publicResult = buildPublicRoundResult(roundResult);
    const playerResult = member && Array.isArray(roundResult.players)
        ? roundResult.players.find(player => player.username === member.username)
        : null;

    if (!member || member.role === 'spectator') {
        return {
            ...publicResult,
            resultForYou: {
                outcome: 'spectator',
                isWinner: false,
                attempts: 0,
                timedOut: false,
                isCorrect: false
            }
        };
    }

    const isWinner = Boolean(roundResult.winnerSocketId && member.socketId === roundResult.winnerSocketId);
    const outcome = playerResult?.outcome || (roundResult.status === 'draw'
        ? 'draw'
        : isWinner ? 'win' : member.finished ? 'loss' : 'pending');

    return {
        ...publicResult,
        resultForYou: {
            outcome,
            isWinner,
            attempts: typeof member.attempts === 'number' ? member.attempts : playerResult?.attempts || 0,
            timedOut: Boolean(member.timedOut),
            isCorrect: Boolean(member.correctGuess)
        }
    };
}

module.exports = {
    buildPublicRoundResult,
    buildPersonalRoundResult,
    resolveRoundWinner
};
