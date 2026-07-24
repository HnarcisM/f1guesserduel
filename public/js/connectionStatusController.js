export const CONNECTION_STATES = Object.freeze({
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    RESTORED: 'restored',
    OFFLINE: 'offline'
});

const STATUS_DETAILS = Object.freeze({
    [CONNECTION_STATES.CONNECTED]: {
        label: 'Conectat',
        title: 'Conexiunea cu serverul este activă.'
    },
    [CONNECTION_STATES.RECONNECTING]: {
        label: 'Reconectare…',
        firstLabel: 'Conectare…',
        title: 'Se încearcă reconectarea la server.',
        firstTitle: 'Se încearcă conectarea la server.'
    },
    [CONNECTION_STATES.RESTORED]: {
        label: 'Restabilit',
        title: 'Conexiunea cu serverul a fost restabilită.'
    },
    [CONNECTION_STATES.OFFLINE]: {
        label: 'Offline',
        title: 'Nu există conexiune activă cu serverul.'
    }
});

function isKnownState(value) {
    return Object.values(CONNECTION_STATES).includes(value);
}

export function resolveDisconnectConnectionState({
    browserOnline = true,
    socketActive = false,
    reason = ''
} = {}) {
    if (!browserOnline) return CONNECTION_STATES.OFFLINE;
    if (reason === 'io client disconnect' || reason === 'io server disconnect') {
        return CONNECTION_STATES.OFFLINE;
    }
    return socketActive ? CONNECTION_STATES.RECONNECTING : CONNECTION_STATES.OFFLINE;
}

export function createConnectionStatusController({
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator,
    restoredDurationMs = 2800,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout
} = {}) {
    let currentState = navigatorObject?.onLine === false
        ? CONNECTION_STATES.OFFLINE
        : CONNECTION_STATES.RECONNECTING;
    let socket = null;
    let manager = null;
    let socketListeners = [];
    let managerListeners = [];
    let restoredTimer = null;
    let hasConnectedOnce = false;
    let setupComplete = false;

    function getElements() {
        return {
            status: documentObject?.getElementById?.('connectionStatus') || null,
            label: documentObject?.getElementById?.('connectionStatusLabel') || null
        };
    }

    function clearRestoredTimer() {
        if (restoredTimer === null) return;
        clearTimeoutFn?.(restoredTimer);
        restoredTimer = null;
    }

    function render() {
        const { status, label } = getElements();
        if (!status) return false;

        const details = STATUS_DETAILS[currentState] || STATUS_DETAILS[CONNECTION_STATES.OFFLINE];
        const isFirstConnectionAttempt = currentState === CONNECTION_STATES.RECONNECTING && !hasConnectedOnce;
        const visibleLabel = isFirstConnectionAttempt ? details.firstLabel : details.label;
        const accessibleTitle = isFirstConnectionAttempt ? details.firstTitle : details.title;

        status.dataset.connectionState = currentState;
        status.setAttribute?.('aria-label', accessibleTitle);
        status.setAttribute?.('title', accessibleTitle);
        if (label) label.textContent = visibleLabel;
        return true;
    }

    function setState(nextState) {
        currentState = isKnownState(nextState) ? nextState : CONNECTION_STATES.OFFLINE;
        clearRestoredTimer();
        render();

        if (currentState === CONNECTION_STATES.RESTORED) {
            const delay = Math.max(0, Number(restoredDurationMs) || 0);
            restoredTimer = setTimeoutFn?.(() => {
                restoredTimer = null;
                currentState = CONNECTION_STATES.CONNECTED;
                render();
            }, delay) ?? null;
        }
        return currentState;
    }

    function handleConnect() {
        const restored = hasConnectedOnce;
        hasConnectedOnce = true;
        setState(restored ? CONNECTION_STATES.RESTORED : CONNECTION_STATES.CONNECTED);
    }

    function handleDisconnect(reason = '') {
        setState(resolveDisconnectConnectionState({
            browserOnline: navigatorObject?.onLine !== false,
            socketActive: socket?.active === true,
            reason
        }));
    }

    function handleConnectError() {
        setState(navigatorObject?.onLine === false
            ? CONNECTION_STATES.OFFLINE
            : CONNECTION_STATES.RECONNECTING);
    }

    function handleReconnectAttempt() {
        setState(navigatorObject?.onLine === false
            ? CONNECTION_STATES.OFFLINE
            : CONNECTION_STATES.RECONNECTING);
    }

    function handleReconnectFailed() {
        setState(CONNECTION_STATES.OFFLINE);
    }

    function handleBrowserOffline() {
        setState(CONNECTION_STATES.OFFLINE);
    }

    function handleBrowserOnline() {
        if (socket?.connected) {
            setState(hasConnectedOnce ? CONNECTION_STATES.RESTORED : CONNECTION_STATES.CONNECTED);
            hasConnectedOnce = true;
            return;
        }
        setState(CONNECTION_STATES.RECONNECTING);
    }

    function addListener(target, collection, eventName, handler) {
        if (!target || typeof target.on !== 'function') return;
        target.on(eventName, handler);
        collection.push({ target, eventName, handler });
    }

    function removeListeners(collection) {
        for (const { target, eventName, handler } of collection) {
            target?.off?.(eventName, handler);
        }
        collection.length = 0;
    }

    function detachSocket() {
        removeListeners(socketListeners);
        removeListeners(managerListeners);
        socket = null;
        manager = null;
    }

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function') return false;
        if (nextSocket === socket) return true;

        detachSocket();
        socket = nextSocket;
        manager = nextSocket.io || null;

        addListener(socket, socketListeners, 'connect', handleConnect);
        addListener(socket, socketListeners, 'disconnect', handleDisconnect);
        addListener(socket, socketListeners, 'connect_error', handleConnectError);
        addListener(manager, managerListeners, 'reconnect_attempt', handleReconnectAttempt);
        addListener(manager, managerListeners, 'reconnect_error', handleReconnectAttempt);
        addListener(manager, managerListeners, 'reconnect_failed', handleReconnectFailed);

        if (navigatorObject?.onLine === false) {
            setState(CONNECTION_STATES.OFFLINE);
        } else if (socket.connected) {
            handleConnect();
        } else {
            setState(CONNECTION_STATES.RECONNECTING);
        }
        return true;
    }

    function setup() {
        if (setupComplete) return true;
        if (!getElements().status) return false;

        windowObject?.addEventListener?.('online', handleBrowserOnline);
        windowObject?.addEventListener?.('offline', handleBrowserOffline);
        render();
        setupComplete = true;
        return true;
    }

    function destroy() {
        clearRestoredTimer();
        detachSocket();
        if (setupComplete) {
            windowObject?.removeEventListener?.('online', handleBrowserOnline);
            windowObject?.removeEventListener?.('offline', handleBrowserOffline);
        }
        setupComplete = false;
    }

    return {
        setup,
        destroy,
        attachSocket,
        detachSocket,
        setState,
        getState: () => currentState,
        hasConnected: () => hasConnectedOnce
    };
}

export function installConnectionStatusController(windowObject = globalThis.window) {
    if (!windowObject?.document) return null;
    if (windowObject.__f1ConnectionStatusController) {
        return windowObject.__f1ConnectionStatusController;
    }

    const controller = createConnectionStatusController({
        documentObject: windowObject.document,
        windowObject,
        navigatorObject: windowObject.navigator
    });
    controller.setup();
    windowObject.addEventListener?.('f1:socket-created', event => {
        controller.attachSocket(event.detail?.socket);
    });
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1ConnectionStatusController = controller;
    return controller;
}

if (typeof window !== 'undefined' && window.document) {
    installConnectionStatusController(window);
}
