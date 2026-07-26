import { authApi } from './apiClient.js';
import { VARIANT_COPY } from './extendedModesConfig.js';
import { createExtendedModesController } from './extendedModesController.js';
import { installPageNavigation, updateAccountBadge } from './extendedModeHeaderController.js';
import { ensureClassicExtendedModeShell, ensureExtendedModeLegend } from './extendedModeShell.js';

const MODE_PATHS = Object.freeze({
    'speed-run': '/modes/speed-run/',
    era: '/modes/era/',
    streak: '/modes/streak/',
    weekly: '/modes/weekly/',
    constructor: '/modes/constructor/',
    'pilot-sudoku': '/modes/pilot-sudoku/',
    track: '/modes/track/'
});

function getModeKey(documentObject) {
    return String(documentObject?.body?.dataset?.extendedMode || '').trim();
}

function waitForSocketConnection(socket, timeoutMs = 4000) {
    if (socket?.connected) return Promise.resolve(true);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            socket?.off?.('connect', handleConnect);
            resolve(value);
        };
        const handleConnect = () => finish(true);
        const timeout = setTimeout(() => finish(false), timeoutMs);
        socket?.on?.('connect', handleConnect);
    });
}

function refreshSocketAuth(socket, socketAuthToken, timeoutMs = 4000) {
    if (!socket || typeof socket.emit !== 'function') return Promise.resolve(false);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(Boolean(value));
        };
        const timeout = setTimeout(() => finish(false), timeoutMs);
        socket.emit('refreshAuthUser', { socketAuthToken: socketAuthToken || null }, response => {
            finish(response?.authenticated);
        });
    });
}

async function loadAuthenticatedUser(socket, documentObject) {
    let authPayload = null;
    try {
        authPayload = await authApi.me();
    } catch {
        authPayload = { user: null, socketAuthToken: null };
    }
    updateAccountBadge(documentObject, authPayload.user || null);
    await waitForSocketConnection(socket);
    await refreshSocketAuth(socket, authPayload.socketAuthToken || null);
    return authPayload.user || null;
}

async function setupEmbeddedAuth({ socket, documentObject, afterAuthChanged = null }) {
    if (!documentObject.getElementById('authPanel')) return null;

    const { createAuthView } = await import('./authView.js');
    let setupComplete = false;
    let socketAuthSyncPromise = Promise.resolve(false);
    const authView = createAuthView({
        onAuthChanged(user, socketAuthToken) {
            updateAccountBadge(documentObject, user || null);
            socketAuthSyncPromise = waitForSocketConnection(socket)
                .then(() => refreshSocketAuth(socket, socketAuthToken || null));
            if (setupComplete && typeof afterAuthChanged === 'function') {
                socketAuthSyncPromise = socketAuthSyncPromise
                    .then(() => afterAuthChanged(user || null))
                    .catch(() => false);
            }
        }
    });

    await authView.setup();
    await socketAuthSyncPromise;
    setupComplete = true;
    return authView;
}

function preparePageSurface(controller, documentObject) {
    const panel = controller?._elements?.panel;
    const close = controller?._elements?.close;
    const root = documentObject.getElementById('modePageContent');
    if (panel) {
        panel.classList.add('extended-mode-page-surface');
        panel.setAttribute('role', 'region');
        panel.removeAttribute('aria-modal');
        root?.replaceChildren?.(panel);
    }
    if (close) {
        close.textContent = 'Game Hub';
        close.setAttribute('aria-label', 'Înapoi la Game Hub');
    }
}

function renderFatalError(documentObject, message) {
    const root = documentObject.getElementById('modePageContent') || documentObject.body;
    const section = documentObject.createElement('section');
    section.className = 'mode-page-error';
    const title = documentObject.createElement('h1');
    title.textContent = 'Modul nu a putut fi pornit';
    const copy = documentObject.createElement('p');
    copy.textContent = message;
    section.append(title, copy);
    root.replaceChildren(section);
}

async function startExtendedModePage({
    modeKey: requestedModeKey = null,
    windowObject = globalThis.window,
    documentObject = windowObject?.document
} = {}) {
    if (!windowObject || !documentObject) return null;

    const documentModeKey = getModeKey(documentObject);
    const modeKey = requestedModeKey || documentModeKey;
    const copy = VARIANT_COPY[modeKey];
    const normalizedPath = windowObject.location.pathname.replace(/index\.html$/, '');
    if (!copy || modeKey !== documentModeKey || MODE_PATHS[modeKey] !== normalizedPath) {
        renderFatalError(documentObject, 'Adresa modului nu este validă. Revino în Game Hub și încearcă din nou.');
        return null;
    }

    documentObject.title = `${copy.title} · F1 Guesser Duel`;
    ensureClassicExtendedModeShell({ documentObject, modeKey });
    await windowObject.F1RuntimeSettings?.load?.({ force: true });
    if (windowObject.F1RuntimeSettings?.isMaintenanceEnabled?.()) {
        renderFatalError(documentObject, windowObject.F1RuntimeSettings.getSnapshot().maintenance.message || 'Aplicația este temporar în mentenanță.');
        return null;
    }
    if (windowObject.F1RuntimeSettings?.isModeEnabled?.(modeKey) === false) {
        renderFatalError(documentObject, 'Acest mod este temporar dezactivat de administrator.');
        return null;
    }
    const socket = typeof windowObject.io === 'function' ? windowObject.io() : null;
    if (!socket) {
        renderFatalError(documentObject, 'Conexiunea Socket.IO nu este disponibilă. Reîncarcă pagina.');
        return null;
    }
    windowObject.__f1GameSocket = socket;

    const controller = createExtendedModesController({
        windowObject,
        documentObject,
        storage: windowObject.localStorage
    });
    if (!controller) {
        renderFatalError(documentObject, 'Controllerul modului nu a putut fi inițializat.');
        return null;
    }

    preparePageSurface(controller, documentObject);
    ensureExtendedModeLegend(documentObject);
    installPageNavigation({ windowObject, documentObject, socket });
    const modeTrigger = documentObject.getElementById('siteHomeControl')
        || documentObject.getElementById('modePageHome');
    const embeddedAuthView = await setupEmbeddedAuth({
        socket,
        documentObject,
        afterAuthChanged() {
            if (modeKey !== 'weekly') return false;
            return controller.open(modeKey, { trigger: modeTrigger });
        }
    });
    if (!embeddedAuthView) await loadAuthenticatedUser(socket, documentObject);
    await controller.open(modeKey, { trigger: modeTrigger });
    return controller;
}

async function runExtendedModePage(modeKey, options = {}) {
    try {
        return await startExtendedModePage({ ...options, modeKey });
    } catch (error) {
        const documentObject = options.documentObject || options.windowObject?.document || globalThis.document;
        if (documentObject) {
            renderFatalError(documentObject, error?.message || 'A apărut o eroare neașteptată.');
        }
        return null;
    }
}

export {
    MODE_PATHS,
    getModeKey,
    loadAuthenticatedUser,
    refreshSocketAuth,
    runExtendedModePage,
    setupEmbeddedAuth,
    startExtendedModePage,
    waitForSocketConnection
};
