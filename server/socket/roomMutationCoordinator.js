const { isValidRoomId } = require('../config/constants');

const DISTRIBUTED_ROOM_MUTATION_EVENTS = new Set([
    'joinRoom',
    'updateDuelLobbySettings',
    'setDuelReady',
    'selectDuelPlayer',
    'refreshAuthUser',
    'setDifficulty',
    'submitGuess',
    'timeExpired',
    'restartGame',
    'abortDuelRound'
]);

function resolveMutationRoomId(eventName, state, args) {
    if (eventName !== 'joinRoom') return state.currentRoom;

    const payload = args[0];
    if (typeof payload === 'string') return payload;
    return payload && typeof payload.roomId === 'string' ? payload.roomId : null;
}

function createRoomMutationCoordinator({ roomStore, state, socket, logger = console }) {
    async function withRoomMutation(roomId, handler) {
        if (!isValidRoomId(roomId) || typeof roomStore?.runExclusive !== 'function') {
            return handler();
        }

        try {
            return await roomStore.runExclusive(roomId, handler);
        } catch (error) {
            logger?.error?.('[rooms] Mutația distribuită a camerei a eșuat.', {
                error,
                roomId,
                socketId: socket.id
            });
            socket.emit('errorMessage', error?.code === 'ROOM_LOCK_TIMEOUT'
                ? 'Camera este ocupată momentan. Încearcă din nou în câteva secunde.'
                : 'Nu am putut sincroniza acțiunea în cameră. Încearcă din nou.');
            return undefined;
        }
    }

    function coordinateEventHandler(eventName, handler) {
        if (!DISTRIBUTED_ROOM_MUTATION_EVENTS.has(eventName)) return handler;
        return (...args) => withRoomMutation(
            resolveMutationRoomId(eventName, state, args),
            () => handler(...args)
        );
    }

    return { withRoomMutation, coordinateEventHandler };
}

module.exports = {
    DISTRIBUTED_ROOM_MUTATION_EVENTS,
    resolveMutationRoomId,
    createRoomMutationCoordinator
};
