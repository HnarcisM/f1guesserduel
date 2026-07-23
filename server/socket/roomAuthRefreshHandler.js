const { refreshRoomMemberAuth } = require('../rooms/roomService');

function createRoomAuthRefreshHandler({
    socket,
    state,
    roomStore,
    sessionService,
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

        socket.user = authUser;
        socket.data = socket.data || {};
        socket.data.authUser = authUser || null;
        if (socketAuthToken && !authUser) socket.emit('authRefreshFailed');
        if (!room) {
            acknowledge?.({ authenticated: Boolean(authUser) });
            return;
        }

        const member = refreshRoomMemberAuth(room, socket.id, authUser);
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
