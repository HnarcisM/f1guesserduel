const assert = require('node:assert/strict');
const test = require('node:test');

const controllerModulePromise = import('../public/js/connectionStatusController.js');

async function importController() {
    return controllerModulePromise;
}

function createEmitter(properties = {}) {
    const listeners = new Map();
    return {
        ...properties,
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return this;
        },
        off(eventName, handler) {
            if (handler) listeners.get(eventName)?.delete(handler);
            else listeners.delete(eventName);
            return this;
        },
        emitEvent(eventName, ...args) {
            for (const handler of listeners.get(eventName) || []) handler(...args);
        },
        listenerCount(eventName) {
            return listeners.get(eventName)?.size || 0;
        }
    };
}

function createDocument() {
    const status = {
        dataset: {},
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name] ?? null;
        }
    };
    const label = { textContent: '' };
    const elements = new Map([
        ['connectionStatus', status],
        ['connectionStatusLabel', label]
    ]);
    return {
        status,
        label,
        documentObject: {
            getElementById(id) {
                return elements.get(id) || null;
            }
        }
    };
}

function createWindow(documentObject, navigatorObject = { onLine: true }) {
    const listeners = new Map();
    return {
        document: documentObject,
        navigator: navigatorObject,
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
        },
        removeEventListener(eventName, handler) {
            listeners.get(eventName)?.delete(handler);
        },
        dispatch(eventName, payload = {}) {
            for (const handler of listeners.get(eventName) || []) handler(payload);
        },
        listenerCount(eventName) {
            return listeners.get(eventName)?.size || 0;
        }
    };
}

function createSocket({ connected = false, active = true } = {}) {
    const manager = createEmitter();
    return createEmitter({ connected, active, io: manager });
}

test('disconnect reasons map to reconnecting or offline states safely', async () => {
    const { CONNECTION_STATES, resolveDisconnectConnectionState } = await importController();

    assert.equal(resolveDisconnectConnectionState({
        browserOnline: false,
        socketActive: true,
        reason: 'transport close'
    }), CONNECTION_STATES.OFFLINE);
    assert.equal(resolveDisconnectConnectionState({
        browserOnline: true,
        socketActive: true,
        reason: 'transport close'
    }), CONNECTION_STATES.RECONNECTING);
    assert.equal(resolveDisconnectConnectionState({
        browserOnline: true,
        socketActive: false,
        reason: 'io server disconnect'
    }), CONNECTION_STATES.OFFLINE);
    assert.equal(resolveDisconnectConnectionState({
        browserOnline: true,
        socketActive: true,
        reason: 'io client disconnect'
    }), CONNECTION_STATES.OFFLINE);
});

test('global connection indicator follows connect, reconnect, restored and offline transitions', async () => {
    const { CONNECTION_STATES, createConnectionStatusController } = await importController();
    const { documentObject, status, label } = createDocument();
    const navigatorObject = { onLine: true };
    const windowObject = createWindow(documentObject, navigatorObject);
    const timers = [];
    const controller = createConnectionStatusController({
        documentObject,
        windowObject,
        navigatorObject,
        restoredDurationMs: 2000,
        setTimeoutFn(callback, delay) {
            const timer = { callback, delay };
            timers.push(timer);
            return timer;
        },
        clearTimeoutFn() {}
    });

    assert.equal(controller.setup(), true);
    assert.equal(controller.getState(), CONNECTION_STATES.RECONNECTING);
    assert.equal(status.dataset.connectionState, 'reconnecting');
    assert.equal(label.textContent, 'Conectare…');

    const socket = createSocket({ connected: false, active: true });
    assert.equal(controller.attachSocket(socket), true);
    socket.connected = true;
    socket.emitEvent('connect');
    assert.equal(controller.getState(), CONNECTION_STATES.CONNECTED);
    assert.equal(label.textContent, 'Conectat');

    socket.connected = false;
    socket.emitEvent('disconnect', 'transport close');
    assert.equal(controller.getState(), CONNECTION_STATES.RECONNECTING);
    assert.equal(label.textContent, 'Reconectare…');

    socket.io.emitEvent('reconnect_attempt', 1);
    assert.equal(controller.getState(), CONNECTION_STATES.RECONNECTING);

    socket.connected = true;
    socket.emitEvent('connect');
    assert.equal(controller.getState(), CONNECTION_STATES.RESTORED);
    assert.equal(label.textContent, 'Restabilit');
    assert.equal(timers.at(-1).delay, 2000);
    timers.at(-1).callback();
    assert.equal(controller.getState(), CONNECTION_STATES.CONNECTED);

    navigatorObject.onLine = false;
    windowObject.dispatch('offline');
    assert.equal(controller.getState(), CONNECTION_STATES.OFFLINE);
    assert.equal(label.textContent, 'Offline');

    navigatorObject.onLine = true;
    socket.connected = false;
    windowObject.dispatch('online');
    assert.equal(controller.getState(), CONNECTION_STATES.RECONNECTING);

    socket.io.emitEvent('reconnect_failed');
    assert.equal(controller.getState(), CONNECTION_STATES.OFFLINE);
    assert.match(status.getAttribute('aria-label'), /Nu există conexiune/);
});

test('attaching a replacement socket removes stale lifecycle listeners', async () => {
    const { createConnectionStatusController } = await importController();
    const { documentObject } = createDocument();
    const navigatorObject = { onLine: true };
    const windowObject = createWindow(documentObject, navigatorObject);
    const controller = createConnectionStatusController({
        documentObject,
        windowObject,
        navigatorObject,
        setTimeoutFn: () => 1,
        clearTimeoutFn() {}
    });
    const firstSocket = createSocket();
    const secondSocket = createSocket();

    controller.setup();
    controller.attachSocket(firstSocket);
    assert.equal(firstSocket.listenerCount('connect'), 1);
    assert.equal(firstSocket.io.listenerCount('reconnect_attempt'), 1);

    controller.attachSocket(secondSocket);
    assert.equal(firstSocket.listenerCount('connect'), 0);
    assert.equal(firstSocket.io.listenerCount('reconnect_attempt'), 0);
    assert.equal(secondSocket.listenerCount('connect'), 1);

    controller.destroy();
    assert.equal(secondSocket.listenerCount('connect'), 0);
    assert.equal(windowObject.listenerCount('online'), 0);
    assert.equal(windowObject.listenerCount('offline'), 0);
});

test('standalone installer reuses one controller and follows current and future sockets', async () => {
    const { installConnectionStatusController } = await importController();
    const { documentObject, label } = createDocument();
    const navigatorObject = { onLine: true };
    const currentSocket = createSocket({ connected: true, active: true });
    const windowObject = createWindow(documentObject, navigatorObject);
    windowObject.__f1GameSocket = currentSocket;

    const controller = installConnectionStatusController(windowObject);
    assert.ok(controller);
    assert.equal(windowObject.__f1ConnectionStatusController, controller);
    assert.equal(label.textContent, 'Conectat');
    assert.equal(currentSocket.listenerCount('disconnect'), 1);
    assert.equal(installConnectionStatusController(windowObject), controller);

    const futureSocket = createSocket({ connected: false, active: true });
    windowObject.dispatch('f1:socket-created', { detail: { socket: futureSocket } });
    assert.equal(currentSocket.listenerCount('disconnect'), 0);
    assert.equal(futureSocket.listenerCount('disconnect'), 1);

    assert.equal(installConnectionStatusController({}), null);
});

test('controller remains inert when the global indicator is absent', async () => {
    const { createConnectionStatusController } = await importController();
    const controller = createConnectionStatusController({
        documentObject: { getElementById() { return null; } },
        windowObject: {},
        navigatorObject: { onLine: true }
    });

    assert.equal(controller.setup(), false);
    assert.equal(controller.attachSocket(null), false);
});
