const { buildPublicMemberIdentity } = require('../rooms/memberIdentity');

async function resolveDuelAuthUser({ authUser, accountStatsService = null, logger = console } = {}) {
    if (!authUser) return null;

    let progress = null;
    try {
        if (typeof accountStatsService?.getAccountProgress === 'function') {
            progress = await accountStatsService.getAccountProgress(authUser.id);
        } else if (typeof accountStatsService?.getAccountDashboard === 'function') {
            progress = (await accountStatsService.getAccountDashboard(authUser.id, { historyLimit: 1 }))?.progress || null;
        }
    } catch (error) {
        logger?.warn?.('Duel identity level lookup failed; using level 1.', {
            error,
            userId: authUser.id
        });
    }

    return {
        id: authUser.id,
        ...buildPublicMemberIdentity({
            username: authUser.username,
            avatarKey: authUser.avatarKey,
            level: progress?.level ?? authUser.level
        })
    };
}

async function resolveSocketDuelAuthUser(socket, accountStatsService = null, logger = console) {
    const identity = await resolveDuelAuthUser({
        authUser: socket?.user || null,
        accountStatsService,
        logger
    });
    if (socket) {
        socket.data = socket.data || {};
        socket.data.duelIdentity = identity;
    }
    return identity;
}

module.exports = {
    resolveDuelAuthUser,
    resolveSocketDuelAuthUser
};
