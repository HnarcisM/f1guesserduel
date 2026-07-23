(function installSocketBridge(globalObject) {
    'use strict';

    if (!globalObject || typeof globalObject.io !== 'function' || globalObject.io.__f1SocketBridge) return;

    const originalIo = globalObject.io;
    function wrappedIo(...args) {
        const socket = originalIo.apply(this, args);
        globalObject.__f1GameSocket = socket;
        const notify = () => {
            if (typeof globalObject.dispatchEvent !== 'function') return;
            const EventConstructor = globalObject.CustomEvent;
            if (typeof EventConstructor !== 'function') return;
            globalObject.dispatchEvent(new EventConstructor('f1:socket-created', {
                detail: { socket }
            }));
        };
        if (typeof globalObject.queueMicrotask === 'function') globalObject.queueMicrotask(notify);
        else Promise.resolve().then(notify);
        return socket;
    }

    Object.assign(wrappedIo, originalIo);
    Object.setPrototypeOf(wrappedIo, Object.getPrototypeOf(originalIo));
    Object.defineProperty(wrappedIo, '__f1SocketBridge', { value: true });
    globalObject.io = wrappedIo;
}(typeof window !== 'undefined' ? window : null));
