const { attachSocketAuth } = require('./socketAuth');
const { createRoomStateEmitter } = require('./roomStateEmitter');
const { registerSoloGameSocketHandlers } = require('./soloGameSocketHandlers');
const { registerDailyChallengeSocketHandlers } = require('./dailyChallengeSocketHandlers');
const { createSocketEventRateLimiter } = require('./socketEventRateLimit');
const { buildPublicRoomListPayload } = require('./roomListPayloads');
const { registerDuelLobbySocketHandlers } = require('./duelLobbySocketHandlers');
const { registerDuelLifecycleSocketHandlers } = require('./duelLifecycleSocketHandlers');
const {
    buildDuelAccountResults,
    registerDuelRoundSocketHandlers
} = require('./duelRoundSocketHandlers');

function registerSocketHandlers(io, dependencies) {
    const {
        roomStore,
        gameService,
        sessionService,
        accountStatsService = null,
        logger = console,
        metrics = null
    } = dependencies;
    const dailySessions = new Map();
    const singleSessions = new Map();
    const socketEventRateLimiter = createSocketEventRateLimiter(dependencies.socketRateLimit);

    attachSocketAuth(io, sessionService);

    const roomStateEmitter = createRoomStateEmitter(io, roomStore, metrics);
    const {
        cleanupInactiveMembers,
        emitRoomStateUpdate
    } = roomStateEmitter;

    function cleanupRoomsBeforeList() {
        if (typeof roomStore?.values !== 'function') return;
        for (const room of roomStore.values()) {
            if (room?.roomId) cleanupInactiveMembers(room.roomId, room);
        }
    }

    function emitRoomListUpdate(target = io) {
        cleanupRoomsBeforeList();
        const payload = buildPublicRoomListPayload(roomStore);
        if (typeof target?.emit === 'function') target.emit('roomListUpdate', payload);
        return payload;
    }

    io.on('connection', socket => {
        const state = {
            currentRoom: null,
            hasMarkedCurrentRoomDisconnected: false
        };

        function onSocketEvent(eventName, handler) {
            socketEventRateLimiter.register(socket, eventName, handler);
        }

        function clearSoloModeSessions() {
            singleSessions.delete(socket.id);
            dailySessions.delete(socket.id);
        }

        const context = {
            io,
            socket,
            state,
            roomStore,
            gameService,
            sessionService,
            accountStatsService,
            logger,
            metrics,
            dailySessions,
            singleSessions,
            socketEventRateLimiter,
            onSocketEvent,
            clearSoloModeSessions,
            emitRoomListUpdate,
            ...roomStateEmitter
        };

        const { leaveCurrentRoom } = registerDuelLifecycleSocketHandlers(context);
        registerDuelLobbySocketHandlers(context);
        registerDuelRoundSocketHandlers(context);
        registerSoloGameSocketHandlers({
            socket,
            singleSessions,
            gameService,
            leaveCurrentRoom,
            accountStatsService,
            logger,
            onSocketEvent
        });
        registerDailyChallengeSocketHandlers({
            socket,
            dailySessions,
            singleSessions,
            gameService,
            leaveCurrentRoom,
            accountStatsService,
            logger,
            onSocketEvent
        });
    });
}

module.exports = {
    buildDuelAccountResults,
    registerSocketHandlers
};
