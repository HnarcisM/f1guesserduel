const { applyRoundToDuelMatch } = require('./duelMatchService');
function buildScoreKey(member) {
    if (!member) return null;
    if (member.scoreKey) return member.scoreKey;
    if (member.userId) return `user:${member.userId}`;
    if (member.guestUsername) return `guest:${member.guestUsername}`;
    if (member.username) return `guest:${member.username}`;
    return null;
}

function ensureRoomScoreboard(room) {
    if (!room) return {};
    if (!room.scoreboard || typeof room.scoreboard !== 'object') {
        room.scoreboard = {};
    }
    return room.scoreboard;
}

function ensureMemberScoreKey(member) {
    if (!member) return null;
    if (!member.scoreKey) {
        member.scoreKey = buildScoreKey(member);
    }
    return member.scoreKey;
}

function ensureMemberScoreEntry(room, member) {
    if (!room || !member) return null;
    const scoreboard = ensureRoomScoreboard(room);
    const scoreKey = ensureMemberScoreKey(member);
    if (!scoreKey) return null;

    if (!scoreboard[scoreKey]) {
        scoreboard[scoreKey] = {
            scoreKey,
            username: member.username,
            wins: 0
        };
    }

    scoreboard[scoreKey].username = member.username;
    scoreboard[scoreKey].wins = typeof scoreboard[scoreKey].wins === 'number'
        ? scoreboard[scoreKey].wins
        : 0;

    return scoreboard[scoreKey];
}

function syncScoreboardWithPlayers(room) {
    if (!room) return [];
    const players = Object.values(room.players || {});
    return players
        .map(player => ensureMemberScoreEntry(room, player))
        .filter(Boolean);
}

function applyRoundResultToScoreboard(room, roundResult) {
    if (!room || !roundResult) return false;
    ensureRoomScoreboard(room);
    syncScoreboardWithPlayers(room);

    if (roundResult.scoreApplied) {
        if (!roundResult.matchApplied) applyRoundToDuelMatch(room, roundResult);
        return false;
    }
    if (!roundResult.allPlayersFinished) return false;
    if (roundResult.status !== 'win' || !roundResult.winnerSocketId) {
        roundResult.scoreApplied = true;
        applyRoundToDuelMatch(room, roundResult);
        return false;
    }

    const winner = room.players?.[roundResult.winnerSocketId] || null;
    const entry = ensureMemberScoreEntry(room, winner);
    if (!entry) return false;

    entry.wins += 1;
    roundResult.scoreApplied = true;
    applyRoundToDuelMatch(room, roundResult);
    return true;
}

function buildPublicScoreboard(room) {
    if (!room) return [];
    syncScoreboardWithPlayers(room);
    const players = Object.values(room.players || {});
    return players
        .map(player => {
            const scoreKey = ensureMemberScoreKey(player);
            const entry = scoreKey ? room.scoreboard?.[scoreKey] : null;
            return {
                username: player.username,
                wins: typeof entry?.wins === 'number' ? entry.wins : 0
            };
        });
}

function resetRoomScoreboard(room) {
    if (!room) return;
    room.scoreboard = {};
    syncScoreboardWithPlayers(room);
}

module.exports = {
    applyRoundResultToScoreboard,
    buildPublicScoreboard,
    ensureMemberScoreEntry,
    ensureMemberScoreKey,
    ensureRoomScoreboard,
    resetRoomScoreboard,
    syncScoreboardWithPlayers
};
