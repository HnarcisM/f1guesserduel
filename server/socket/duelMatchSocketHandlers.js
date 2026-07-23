const {
    resetDuelMatch,
    resetDuelReadyState,
    syncScoreboardWithPlayers,
    isDuelMatchFinished,
    isHost,
    isSpectator
} = require('../rooms/roomService');

function registerDuelMatchSocketHandlers(context) {
    const {
        socket,
        state,
        roomStore,
        onSocketEvent,
        emitRoomStateUpdate,
        emitRoomListUpdate
    } = context;

    onSocketEvent('resetDuelMatch', async () => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
        if (!room) return;

        if (isSpectator(room, socket.id) || !isHost(room, socket.id)) {
            socket.emit('errorMessage', 'Doar hostul poate porni un meci nou.');
            return;
        }
        if (room.roundState === 'playing') {
            socket.emit('errorMessage', 'Meciul nu poate fi resetat în timpul unei runde active.');
            return;
        }
        if (!isDuelMatchFinished(room)) {
            socket.emit('errorMessage', 'Meciul curent nu s-a încheiat.');
            return;
        }

        resetDuelMatch(room);
        syncScoreboardWithPlayers(room);
        resetDuelReadyState(room);
        room.roundState = 'waiting';
        room.roundResult = null;
        room.targetDriver = null;
        room.roundStartedAt = null;
        roomStore.markDirty?.(roomId);
        await emitRoomStateUpdate(roomId, 'match-reset');
        await emitRoomListUpdate();
    });
}

module.exports = { registerDuelMatchSocketHandlers };
