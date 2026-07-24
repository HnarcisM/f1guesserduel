const { refreshRoomMemberAuth } = require('../rooms/roomService');
const { resolveDuelAuthUser } = require('./duelIdentityResolver');

function createRoomAuthRefreshHandler({
    socket,
    state,
    roomStore,
    sessionService,
    accountStatsService,
    logger,
    emitHostStatus,
    emitRoomStateUpdate,
    emitRoomRoleStatuses,
    emitRoomListUpdate
}) {
    return async (payload = {}, acknowledge) => {
        const roomId = state.currentRoom;
        const room = roomId ? roomStore.get(roomId) : null;
        const socketAuthToken = payload && typeof payload === 'object'
            ? payload.socketAuthToken
            : null;
        const authUser = socketAuthToken
            ? await sessionService.getUserBySocketAuthToken(socketAuthToken)
            : null;

        const duelAuthUser = await resolveDuelAuthUser({
            authUser,
            accountStatsService,
            logger
        });

        socket.user = authUser;
        socket.data = socket.data || {};
        socket.data.authUser = authUser || null;
        socket.data.duelIdentity = duelAuthUser;
        if (socketAuthToken && !authUser) socket.emit('authRefreshFailed');
        if (!room) {
            acknowledge?.({ authenticated: Boolean(authUser) });
            return;
        }

        const member = refreshRoomMemberAuth(room, socket.id, duelAuthUser);
        if (!member) {
            acknowledge?.({ authenticated: Boolean(authUser) });
            return;
        }

        emitHostStatus(socket, room);
        await emitRoomStateUpdate(roomId, 'auth-updated');
        await emitRoomRoleStatuses(roomId, room);
        await emitRoomListUpdate();
        acknowledge?.({ authenticated: Boolean(authUser) });
    };
}

module.exports = { createRoomAuthRefreshHandler };
