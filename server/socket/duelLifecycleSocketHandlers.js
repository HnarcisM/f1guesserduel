const {
    removePlayerFromRoom,
    markRoomMemberDisconnectedBySocketId,
    getPlayer,
    hasRoomMember,
    isSpectator,
    getRoomMemberCount,
    buildLiveBoardState,
    buildPublicRoomState,
    abortDuelRound
} = require('../rooms/roomService');
const { createRoomAuthRefreshHandler } = require('./roomAuthRefreshHandler');

function registerDuelLifecycleSocketHandlers(context) {
    const {
        io,
        socket,
        state,
        roomStore,
        sessionService,
        socketEventRateLimiter,
        onSocketEvent,
        withRoomMutation,
        clearSoloModeSessions,
        cleanupInactiveMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        emitRoomListUpdate,
        dailySessions,
        metrics,
        logger = console
    } = context;

    async function leaveCurrentRoom() {
        dailySessions.delete(socket.id);
        const roomId = state.currentRoom;
        if (!roomId) return;

        return withRoomMutation(roomId, async () => {
            const room = roomStore.get(roomId);

            if (!room) {
                state.currentRoom = null;
                await socket.leave(roomId);
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
                await emitRoomStateUpdate(roomId, 'duel-aborted');
                await emitRoomListUpdate();
                return;
            }

            state.currentRoom = null;
            await socket.leave(roomId);
            if (hasRoomMember(room, socket.id)) removePlayerFromRoom(room, socket.id);
            await cleanupInactiveMembers(roomId, room);

            if (getRoomMemberCount(room) === 0) {
                if (roomStore.remove(roomId)) metrics?.recordRoomEvent?.('removed');
                await emitRoomListUpdate();
                return;
            }

            await emitRoomStateUpdate(roomId, 'leave');
            await emitRoomRoleStatuses(roomId, room);
            await emitRoomListUpdate();
        });
    }

    async function markCurrentRoomDisconnected() {
        const roomId = state.currentRoom;
        if (!roomId || state.hasMarkedCurrentRoomDisconnected) return;

        return withRoomMutation(roomId, async () => {
            const room = roomStore.get(roomId);
            if (!room) return;

            const disconnectedMember = markRoomMemberDisconnectedBySocketId(room, socket.id);
            if (!disconnectedMember) return;

            metrics?.recordReconnect?.({
                outcome: 'disconnected',
                role: disconnectedMember.role
            });

            state.hasMarkedCurrentRoomDisconnected = true;
            roomStore.markDirty?.(roomId);
            await emitRoomStateUpdate(roomId, 'disconnect');
            await emitRoomListUpdate();
        });
    }

    onSocketEvent('refreshAuthUser', createRoomAuthRefreshHandler({
        socket,
        state,
        roomStore,
        sessionService,
        emitHostStatus,
        emitRoomStateUpdate,
        emitRoomRoleStatuses,
        emitRoomListUpdate
    }));

    function runSafely(operation, message) {
        return operation().catch(error => logger?.error?.(message, { error }));
    }

    socket.on('leaveRoom', () => runSafely(leaveCurrentRoom, '[rooms] Leave room failed.'));
    socket.on('disconnecting', () => runSafely(markCurrentRoomDisconnected, '[rooms] Disconnect sync failed.'));
    socket.on('disconnect', () => {
        clearSoloModeSessions();
        socketEventRateLimiter.clearSocket(socket.id);
        return runSafely(markCurrentRoomDisconnected, '[rooms] Disconnect cleanup failed.');
    });

    return { leaveCurrentRoom, markCurrentRoomDisconnected };
}

module.exports = { registerDuelLifecycleSocketHandlers };
