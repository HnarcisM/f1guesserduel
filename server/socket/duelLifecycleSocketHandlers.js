const {
    removePlayerFromRoom,
    markRoomMemberDisconnectedBySocketId,
    refreshRoomMemberAuth,
    getPlayer,
    hasRoomMember,
    isSpectator,
    getRoomMemberCount,
    buildLiveBoardState,
    buildPublicRoomState,
    abortDuelRound
} = require('../rooms/roomService');

function registerDuelLifecycleSocketHandlers(context) {
    const {
        io,
        socket,
        state,
        roomStore,
        sessionService,
        socketEventRateLimiter,
        onSocketEvent,
        clearSoloModeSessions,
        cleanupInactiveMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        emitRoomListUpdate,
        dailySessions
    } = context;

    function leaveCurrentRoom() {
        dailySessions.delete(socket.id);
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);

        if (!room) {
            state.currentRoom = null;
            socket.leave(roomId);
            return;
        }

        if (hasRoomMember(room, socket.id) && room.roundState === 'playing' && !isSpectator(room, socket.id)) {
            const result = abortDuelRound(room, 'player-aborted');
            roomStore.markDirty?.(roomId);
            io.to(roomId).emit('duelAborted', {
                message: `${getPlayer(room, socket.id)?.username || 'Un jucător'} a oprit runda. Revenim în lobby.`,
                roundResult: result,
                room: buildPublicRoomState(room),
                liveBoard: buildLiveBoardState(room)
            });
            emitRoomStateUpdate(roomId, 'duel-aborted');
            emitRoomListUpdate();
            return;
        }

        state.currentRoom = null;
        socket.leave(roomId);
        if (hasRoomMember(room, socket.id)) removePlayerFromRoom(room, socket.id);
        cleanupInactiveMembers(roomId, room);

        if (getRoomMemberCount(room) === 0) {
            roomStore.remove(roomId);
            emitRoomListUpdate();
            return;
        }

        emitRoomStateUpdate(roomId, 'leave');
        emitRoomRoleStatuses(room);
        emitRoomListUpdate();
    }

    function markCurrentRoomDisconnected() {
        const roomId = state.currentRoom;
        if (!roomId || state.hasMarkedCurrentRoomDisconnected) return;
        const room = roomStore.get(roomId);
        if (!room) return;

        const disconnectedMember = markRoomMemberDisconnectedBySocketId(room, socket.id);
        if (!disconnectedMember) return;

        state.hasMarkedCurrentRoomDisconnected = true;
        roomStore.markDirty?.(roomId);
        emitRoomStateUpdate(roomId, 'disconnect');
        emitRoomListUpdate();
    }

    onSocketEvent('refreshAuthUser', async (payload = {}) => {
        const roomId = state.currentRoom;
        const room = roomId ? roomStore.get(roomId) : null;
        const socketAuthToken = payload && typeof payload === 'object'
            ? payload.socketAuthToken
            : null;
        const authUser = socketAuthToken
            ? await sessionService.getUserBySocketAuthToken(socketAuthToken)
            : null;

        socket.user = authUser;
        if (socketAuthToken && !authUser) socket.emit('authRefreshFailed');
        if (!room) return;

        const member = refreshRoomMemberAuth(room, socket.id, authUser);
        if (!member) return;

        emitHostStatus(socket, room);
        emitRoomStateUpdate(roomId, 'auth-updated');
        emitRoomRoleStatuses(room);
        emitRoomListUpdate();
    });

    socket.on('leaveRoom', leaveCurrentRoom);
    socket.on('disconnecting', markCurrentRoomDisconnected);
    socket.on('disconnect', () => {
        clearSoloModeSessions();
        markCurrentRoomDisconnected();
        socketEventRateLimiter.clearSocket(socket.id);
    });

    return { leaveCurrentRoom, markCurrentRoomDisconnected };
}

module.exports = { registerDuelLifecycleSocketHandlers };
