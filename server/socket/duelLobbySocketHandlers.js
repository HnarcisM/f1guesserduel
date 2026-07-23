const {
    MAX_PLAYERS_PER_ROOM,
    isValidRoomId
} = require('../config/constants');
const {
    createRoom,
    addPlayerToRoom,
    selectSpectatorAsPlayer,
    updateDuelLobbySettings,
    resetDuelReadyState,
    setDuelPlayerReady,
    getPlayer,
    isHost,
    isSpectator,
    getRoomMemberCount,
    buildLiveBoardState
} = require('../rooms/roomService');
const { normalizeRoundOptions } = require('./socketPayloadValidators');
const {
    normalizeJoinRoomPayload,
    buildPlayerProgressPayload
} = require('./socketRoomPayloads');

function registerDuelLobbySocketHandlers(context) {
    const {
        socket,
        state,
        roomStore,
        onSocketEvent,
        clearSoloModeSessions,
        cleanupInactiveMembers,
        emitHostStatus,
        emitRoomRoleStatuses,
        emitRoomStateUpdate,
        emitRoomListUpdate,
        metrics
    } = context;

    onSocketEvent('requestRoomList', async () => {
        await emitRoomListUpdate(socket);
    });

    onSocketEvent('joinRoom', async (payload) => {
        const { roomId, clientId } = normalizeJoinRoomPayload(payload);
        if (!isValidRoomId(roomId)) {
            socket.emit('errorMessage', 'Camera este invalidă. Folosește un room ID de 3-20 caractere.');
            return;
        }

        const memberOptions = {
            clientId,
            onReconnect: event => metrics?.recordReconnect?.({
                ...event,
                outcome: 'restored'
            })
        };
        if (!roomStore.has(roomId)) {
            roomStore.set(roomId, createRoom(roomId, socket.id, socket.user || null, memberOptions));
            metrics?.recordRoomEvent?.('created');
        }

        const room = roomStore.get(roomId);
        if (getRoomMemberCount(room) > 0) await cleanupInactiveMembers(roomId, room);

        const joinResult = addPlayerToRoom(room, socket.id, socket.user || null, memberOptions);
        roomStore.markDirty?.(roomId);
        if (!joinResult?.joined) {
            socket.emit('roomFull', { maxPlayers: MAX_PLAYERS_PER_ROOM });
            return;
        }

        clearSoloModeSessions();
        state.currentRoom = roomId;
        state.hasMarkedCurrentRoomDisconnected = false;
        await socket.join(roomId);
        emitHostStatus(socket, room);
        await emitRoomStateUpdate(roomId, 'join');
        await emitRoomListUpdate();

        if (!room.difficulty || room.roundState !== 'playing') return;

        const initPayload = {
            drivers: room.driversList,
            difficulty: room.difficulty,
            timed: room.timed,
            timeLimitSeconds: room.timeLimitSeconds,
            roundStartedAt: room.roundStartedAt,
            isDailyChallenge: Boolean(room.isDailyChallenge),
            dailyDate: room.dailyDate || null,
            playerProgress: buildPlayerProgressPayload(getPlayer(room, socket.id))
        };
        if (isSpectator(room, socket.id)) initPayload.liveBoard = buildLiveBoardState(room);
        socket.emit('initGame', initPayload);
    });

    onSocketEvent('updateDuelLobbySettings', async (payload) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
        if (!room) return;

        if (isSpectator(room, socket.id)) {
            socket.emit('errorMessage', 'Ești spectator. Doar hostul poate modifica setările din lobby.');
            return;
        }
        if (!isHost(room, socket.id)) {
            socket.emit('errorMessage', 'Doar hostul camerei poate modifica setările din lobby.');
            return;
        }
        if (room.roundState === 'playing') {
            socket.emit('errorMessage', 'Setările pot fi schimbate doar în lobby, după finalul rundei.');
            return;
        }

        const roundOptions = normalizeRoundOptions(payload);
        if (!roundOptions) {
            socket.emit('errorMessage', 'Setările selectate nu sunt valide.');
            return;
        }

        const settingsResult = updateDuelLobbySettings(room, roundOptions);
        if (settingsResult.changed) resetDuelReadyState(room);
        roomStore.markDirty?.(roomId);
        await emitRoomStateUpdate(roomId, 'lobby-settings-updated');
        await emitRoomListUpdate();
    });

    onSocketEvent('setDuelReady', async (payload = {}) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
        if (!room) return;

        if (isSpectator(room, socket.id)) {
            socket.emit('errorMessage', 'Spectatorii nu pot confirma Ready pentru rundă.');
            return;
        }

        const ready = payload && typeof payload === 'object'
            ? payload.ready === true
            : payload === true;
        const result = setDuelPlayerReady(room, socket.id, ready);
        if (result.reason === 'round-active') {
            socket.emit('errorMessage', 'Ready poate fi schimbat doar în lobby.');
            return;
        }
        if (result.reason) {
            socket.emit('errorMessage', 'Nu am putut actualiza starea Ready. Reîncearcă după reconectare.');
            return;
        }

        roomStore.markDirty?.(roomId);
        await emitRoomStateUpdate(roomId, ready ? 'player-ready' : 'player-not-ready');
    });

    onSocketEvent('selectDuelPlayer', async (payload = {}) => {
        const roomId = state.currentRoom;
        if (!roomId) return;
        const room = roomStore.get(roomId);
        if (!room) return;

        if (isSpectator(room, socket.id)) {
            socket.emit('errorMessage', 'Spectatorii pot vedea lobby-ul, dar nu pot schimba jucătorii.');
            return;
        }
        if (!isHost(room, socket.id)) {
            socket.emit('errorMessage', 'Doar hostul poate schimba jucătorii activi.');
            return;
        }
        if (room.roundState === 'playing') {
            socket.emit('errorMessage', 'Nu poți schimba jucătorii în timpul rundei. Oprește runda sau așteaptă finalul.');
            return;
        }

        const lobbyId = payload && typeof payload === 'object' && typeof payload.lobbyId === 'string'
            ? payload.lobbyId
            : null;
        const result = selectSpectatorAsPlayer(room, lobbyId);
        if (!result.changed) {
            socket.emit('errorMessage', 'Nu am putut schimba jucătorul selectat. Verifică dacă spectatorul mai este în lobby.');
            return;
        }

        roomStore.markDirty?.(roomId);
        await emitRoomRoleStatuses(roomId, room);
        await emitRoomStateUpdate(roomId, 'player-selected');
        await emitRoomListUpdate();
    });
}

module.exports = { registerDuelLobbySocketHandlers };
