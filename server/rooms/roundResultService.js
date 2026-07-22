const { applyRoundResultToScoreboard } = require('./scoreboardService');
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

function compareCorrectPlayers(a, b) {
    const attemptsDiff = getPlayerAttempts(a) - getPlayerAttempts(b);
    if (attemptsDiff !== 0) return attemptsDiff;

    const completedAtDiff = getPlayerCompletedAt(a) - getPlayerCompletedAt(b);
    if (completedAtDiff !== 0) return completedAtDiff;

    return 0;
}

function getAllPlayersFinished(players) {
    return players.length > 0 && players.every(player => Boolean(player.finished));
}

function determineRoundOutcome(players) {
    const correctPlayers = players.filter(getPlayerCorrect).sort(compareCorrectPlayers);

    if (correctPlayers.length === 0) {
        return {
            status: 'draw',
            reason: players.every(player => Boolean(player.timedOut)) ? 'all-timed-out' : 'no-correct-guess',
            winner: null
        };
    }

    const best = correctPlayers[0];
    const tiedBestPlayers = correctPlayers.filter(player => compareCorrectPlayers(player, best) === 0);

    if (tiedBestPlayers.length > 1) {
        return {
            status: 'draw',
            reason: 'tie-breaker-draw',
            winner: null
        };
    }

    return {
        status: 'win',
        reason: 'best-result',
        winner: best
    };
}

function buildPlayerResult(player, winnerSocketId = null, isDraw = false) {
    const isWinner = Boolean(winnerSocketId && player.socketId === winnerSocketId);
    const isCorrect = getPlayerCorrect(player);
    let outcome = 'loss';

    if (isDraw) outcome = 'draw';
    else if (isWinner) outcome = 'win';
    else if (!player.finished) outcome = 'pending';

    return {
        // socketId este intern, folosit doar pentru identificarea jucătorului în
        // buildPersonalRoundResult(). NU trebuie expus către client — buildPublicRoundResult()
        // îl exclude explicit printr-un whitelist de câmpuri publice.
        socketId: player.socketId,
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

function buildPublicPlayerResult(player) {
    return {
        username: player.username,
        role: player.role,
        isHost: player.isHost,
        attempts: player.attempts,
        finished: player.finished,
        timedOut: player.timedOut,
        isCorrect: player.isCorrect,
        outcome: player.outcome
    };
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
        scoreApplied: Boolean(roundResult.scoreApplied),
        target: roundResult.target || null,
        players: Array.isArray(roundResult.players)
            ? roundResult.players.map(buildPublicPlayerResult)
            : []
    };
}

function resolveRoundWinner(room, reason = 'guess') {
    if (!room || room.roundState !== 'playing') return room?.roundResult || null;
    if (room.roundResult) return room.roundResult;

    const players = getActivePlayers(room);
    if (players.length === 0) return null;

    const allPlayersFinished = getAllPlayersFinished(players);
    if (!allPlayersFinished) return null;

    const resolvedAt = Date.now();
    const outcome = determineRoundOutcome(players);
    const winner = outcome.winner || null;
    const status = outcome.status;
    const winnerSocketId = winner?.socketId || null;
    const isDraw = status === 'draw';
    const result = {
        status,
        reason: outcome.reason || reason,
        winnerSocketId,
        winnerUsername: winner?.username || null,
        resolvedAt,
        finishedAt: resolvedAt,
        allPlayersFinished: true,
        target: buildTargetSummary(room),
        players: buildRoundPlayers(room, winnerSocketId, isDraw)
    };

    room.roundResult = result;
    room.roundState = 'finished';
    applyRoundResultToScoreboard(room, result);

    return result;
}

function buildPersonalRoundResult(roundResult, member = null) {
    if (!roundResult) return null;

    const publicResult = buildPublicRoundResult(roundResult);
    const playerResult = member && Array.isArray(roundResult.players)
        ? roundResult.players.find(player => player.socketId === member.socketId)
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
        : isWinner ? 'win' : 'loss');

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
