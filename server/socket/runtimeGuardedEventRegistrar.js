'use strict';

const { createRuntimeSocketGuard } = require('../runtime/runtimeSocketGuard');

function createRuntimeGuardedEventRegistrar({
    socket,
    coordinateEventHandler,
    socketEventRateLimiter,
    runtimeSettingsService,
    extendedSessions
} = {}) {
    const runtimeSocketGuard = createRuntimeSocketGuard({ runtimeSettingsService, extendedSessions });

    return function onSocketEvent(eventName, handler) {
        const guardedHandler = async (...args) => {
            const decision = runtimeSocketGuard.evaluate({ eventName, args, socketId: socket.id });
            if (decision.allowed !== false) return handler(...args);

            runtimeSocketGuard.notify(socket, decision);
            const acknowledgement = typeof args.at(-1) === 'function' ? args.at(-1) : null;
            acknowledgement?.({
                ok: false,
                message: decision.message,
                reason: decision.reason
            });
            return undefined;
        };

        socketEventRateLimiter.register(
            socket,
            eventName,
            coordinateEventHandler(eventName, guardedHandler)
        );
    };
}

module.exports = {
    createRuntimeGuardedEventRegistrar
};
