const {
    removeInactiveRoomMembers,
    getRoomMember,
    isHost,
    isSpectator,
    getRoomMemberCount,
    buildLiveBoardState,
    buildPublicRoomState
} = require('../rooms/roomService');

function createRoomStateEmitter(io, roomStore) {
    function isSocketActive(socketId) {
        return io.sockets.sockets.has(socketId);
    }

    function cleanupInactiveMembers(roomId, room) {
        if (!room) return false;
        const changed = removeInactiveRoomMembers(room, isSocketActive);

        if (getRoomMemberCount(room) === 0) {
            roomStore.remove(roomId);
            return true;
        }

        return changed;
    }

    function getActiveRoomSockets(room) {
        const socketIds = new Set([
            ...Object.keys(room.players || {}),
            ...Object.keys(room.spectators || {})
        ]);

        return [...socketIds]
            .map(socketId => io.sockets.sockets.get(socketId))
            .filter(Boolean);
    }

    function buildRoomStatePayload(room, reason = 'sync', recipientSocketId = null) {
        const payload = {
            reason,
            room: buildPublicRoomState(room)
        };

        if (recipientSocketId && isSpectator(room, recipientSocketId)) {
            payload.liveBoard = buildLiveBoardState(room);
        }

        return payload;
    }

    function emitRoomStateUpdate(roomId, reason = 'sync') {
        const room = roomStore.get(roomId);
        if (!room) return;

        const roomWasRemoved = cleanupInactiveMembers(roomId, room);
        if (roomWasRemoved && !roomStore.has(roomId)) return;

        for (const memberSocket of getActiveRoomSockets(room)) {
            memberSocket.emit('roomStateUpdate', buildRoomStatePayload(room, reason, memberSocket.id));
        }
    }

    function emitGameStateToActiveRoomMembers(roomId, eventName, payload, options = {}) {
        const room = roomStore.get(roomId);
        if (!room) return;

        const roomWasRemoved = cleanupInactiveMembers(roomId, room);
        if (roomWasRemoved && !roomStore.has(roomId)) return;

        for (const memberSocket of getActiveRoomSockets(room)) {
            const recipientPayload = { ...payload };

            if (options.includeLiveBoardForSpectators && isSpectator(room, memberSocket.id)) {
                recipientPayload.liveBoard = buildLiveBoardState(room);
            }

            memberSocket.emit(eventName, recipientPayload);
        }
    }

    function emitHostStatus(socket, room) {
        const member = getRoomMember(room, socket.id);
        const role = member?.role || (isSpectator(room, socket.id) ? 'spectator' : 'player');

        socket.emit('hostStatus', {
            isHost: isHost(room, socket.id),
            isSpectator: role === 'spectator',
            role,
            username: member?.username || socket.user?.username || 'Guest',
            user: socket.user || null
        });
    }

    function emitRoomRoleStatuses(room) {
        for (const member of [...Object.values(room.players || {}), ...Object.values(room.spectators || {})]) {
            const memberSocket = io.sockets.sockets.get(member.socketId);
            if (memberSocket) {
                emitHostStatus(memberSocket, room);
            }
        }
    }

    return {
        cleanupInactiveMembers,
        emitGameStateToActiveRoomMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        getActiveRoomSockets,
        isSocketActive
    };
}

module.exports = {
    createRoomStateEmitter
};
