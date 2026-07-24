const {
    removeInactiveRoomMembers,
    getRoomMember,
    isHost,
    isSpectator,
    getRoomMemberCount,
    buildLiveBoardState,
    buildPublicRoomState
} = require('../rooms/roomService');
const { buildPublicMemberIdentity } = require('../rooms/memberIdentity');

function createRoomStateEmitter(io, roomStore, metrics = null) {
    function getLocalSockets() {
        return io?.sockets?.sockets instanceof Map
            ? [...io.sockets.sockets.values()]
            : [];
    }

    async function fetchMatchingSockets(roomId, socketIds = null) {
        if (!roomId) return [];
        const target = typeof io?.in === 'function' ? io.in(roomId) : null;
        const sockets = typeof target?.fetchSockets === 'function'
            ? await target.fetchSockets()
            : getLocalSockets();
        if (!socketIds) return sockets;
        return sockets.filter(socket => socketIds.has(socket.id));
    }

    async function fetchRoomSockets(roomId, room = null) {
        if (!room) return fetchMatchingSockets(roomId);
        const memberSocketIds = new Set([
            ...Object.keys(room.players || {}),
            ...Object.keys(room.spectators || {})
        ]);
        return fetchMatchingSockets(roomId, memberSocketIds);
    }

    async function isSocketActive(socketId) {
        if (!socketId) return false;
        const sockets = await fetchMatchingSockets(socketId, new Set([socketId]));
        return sockets.some(socket => socket.id === socketId);
    }

    async function cleanupInactiveMembers(roomId, room, activeSockets = null) {
        if (!room) return false;
        const sockets = activeSockets || await fetchRoomSockets(roomId, room);
        const activeSocketIds = new Set(sockets.map(socket => socket.id));
        const changed = removeInactiveRoomMembers(room, socketId => activeSocketIds.has(socketId), Date.now(), {
            onMemberExpired: event => metrics?.recordReconnect?.({
                ...event,
                outcome: 'grace_expired'
            })
        });

        if (getRoomMemberCount(room) === 0) {
            if (roomStore.remove(roomId)) metrics?.recordRoomEvent?.('removed');
            return true;
        }

        return changed;
    }

    async function getActiveRoomSockets(roomId, room = null) {
        return fetchRoomSockets(roomId, room);
    }

    function buildRoomStatePayload(room, reason = 'sync', recipientSocketId = null) {
        const payload = {
            reason,
            room: buildPublicRoomState(room, { recipientSocketId })
        };

        if (recipientSocketId && isSpectator(room, recipientSocketId)) {
            payload.liveBoard = buildLiveBoardState(room);
        }

        return payload;
    }

    async function emitRoomStateUpdate(roomId, reason = 'sync') {
        const room = roomStore.get(roomId);
        if (!room) return;

        const memberSockets = await getActiveRoomSockets(roomId, room);
        const roomWasRemoved = await cleanupInactiveMembers(roomId, room, memberSockets);
        if (roomWasRemoved && !roomStore.has(roomId)) return;

        roomStore.markDirty?.(roomId);

        for (const memberSocket of memberSockets) {
            memberSocket.emit('roomStateUpdate', buildRoomStatePayload(room, reason, memberSocket.id));
        }
    }

    async function emitGameStateToActiveRoomMembers(roomId, eventName, payload, options = {}) {
        const room = roomStore.get(roomId);
        if (!room) return;

        const memberSockets = await getActiveRoomSockets(roomId, room);
        const roomWasRemoved = await cleanupInactiveMembers(roomId, room, memberSockets);
        if (roomWasRemoved && !roomStore.has(roomId)) return;

        roomStore.markDirty?.(roomId);

        for (const memberSocket of memberSockets) {
            const recipientPayload = { ...payload };

            if (options.includeLiveBoardForSpectators && isSpectator(room, memberSocket.id)) {
                recipientPayload.liveBoard = buildLiveBoardState(room);
            }

            memberSocket.emit(eventName, recipientPayload);
        }
    }

    function emitHostStatus(socket, room) {
        const member = getRoomMember(room, socket.id);
        const authUser = socket.data?.duelIdentity || socket.user || socket.data?.authUser || null;
        const role = member?.role || (isSpectator(room, socket.id) ? 'spectator' : 'player');
        const identity = buildPublicMemberIdentity(member || authUser || {});

        socket.emit('hostStatus', {
            isHost: isHost(room, socket.id),
            isSpectator: role === 'spectator',
            role,
            ...identity,
            user: authUser ? identity : null
        });
    }

    async function emitRoomRoleStatuses(roomId, room = null) {
        const resolvedRoom = room || roomStore.get(roomId);
        if (!resolvedRoom) return;
        const sockets = await getActiveRoomSockets(roomId, resolvedRoom);
        for (const memberSocket of sockets) emitHostStatus(memberSocket, resolvedRoom);
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
