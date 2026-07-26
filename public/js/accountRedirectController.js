const ACCOUNT_PANEL_HASHES = new Set(['#login', '#profile']);
const MODE_RETURN_STORAGE_KEY = 'f1-mode-return-path';
const EXTENDED_MODE_PATH_PATTERN = /^\/modes\/(?:speed-run|era|streak|weekly|constructor|pilot-sudoku|track)\/(?:index\.html)?$/i;

function normalizeModeReturnPath(pathname) {
    const normalized = String(pathname || '').trim();
    if (!EXTENDED_MODE_PATH_PATTERN.test(normalized)) return null;
    return normalized.replace(/index\.html$/i, '');
}

function consumeModeReturnPath(storage) {
    let storedPath = null;
    try {
        storedPath = storage?.getItem?.(MODE_RETURN_STORAGE_KEY) || null;
        storage?.removeItem?.(MODE_RETURN_STORAGE_KEY);
    } catch {
        return null;
    }
    return normalizeModeReturnPath(storedPath);
}

function clearAccountRequestHash(windowObject) {
    const pathname = String(windowObject?.location?.pathname || '/');
    const search = String(windowObject?.location?.search || '');
    try {
        windowObject?.history?.replaceState?.(
            windowObject.history.state ?? null,
            '',
            `${pathname}${search}`
        );
        return true;
    } catch {
        return false;
    }
}

function watchForPanelClose({ windowObject, panel, returnPath, MutationObserverClass }) {
    if (!returnPath || !panel || typeof MutationObserverClass !== 'function') return null;

    let panelWasOpened = panel.classList?.contains?.('show') === true;
    const observer = new MutationObserverClass(() => {
        const isOpen = panel.classList?.contains?.('show') === true;
        if (isOpen) {
            panelWasOpened = true;
            return;
        }
        if (!panelWasOpened) return;
        observer.disconnect?.();
        windowObject.location.assign(returnPath);
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    return observer;
}

function openRequestedAccountPanel({
    windowObject = globalThis.window,
    documentObject = windowObject?.document,
    MutationObserverClass = windowObject?.MutationObserver
} = {}) {
    const hash = String(windowObject?.location?.hash || '').toLowerCase();
    if (!ACCOUNT_PANEL_HASHES.has(hash)) return false;

    const openButton = documentObject?.getElementById?.('authOpenBtn');
    const panel = documentObject?.getElementById?.('authPanel');
    if (!openButton || typeof openButton.click !== 'function') return false;

    openButton.click();
    if (panel?.classList?.contains?.('show') !== true) return false;

    const returnPath = consumeModeReturnPath(windowObject?.sessionStorage);
    clearAccountRequestHash(windowObject);
    watchForPanelClose({ windowObject, panel, returnPath, MutationObserverClass });
    return true;
}

function setupAccountRedirect(options = {}) {
    const windowObject = options.windowObject || globalThis.window;
    const documentObject = options.documentObject || windowObject?.document;
    if (!documentObject) return;

    const hash = String(windowObject?.location?.hash || '').toLowerCase();
    if (!ACCOUNT_PANEL_HASHES.has(hash)) return;

    const schedule = windowObject?.setTimeout?.bind?.(windowObject) || globalThis.setTimeout;
    const maxAttempts = 10;
    const tryOpen = (attempt = 0) => {
        const opened = openRequestedAccountPanel({
            ...options,
            windowObject,
            documentObject
        });
        if (opened || attempt >= maxAttempts || typeof schedule !== 'function') return;
        schedule(() => tryOpen(attempt + 1), 50);
    };
    const run = () => {
        if (typeof schedule === 'function') schedule(() => tryOpen(), 0);
        else tryOpen();
    };

    if (documentObject.readyState === 'loading') {
        documentObject.addEventListener('DOMContentLoaded', run, { once: true });
        return;
    }
    run();
}

setupAccountRedirect();

export {
    ACCOUNT_PANEL_HASHES,
    EXTENDED_MODE_PATH_PATTERN,
    MODE_RETURN_STORAGE_KEY,
    clearAccountRequestHash,
    consumeModeReturnPath,
    normalizeModeReturnPath,
    openRequestedAccountPanel,
    setupAccountRedirect,
    watchForPanelClose
};
