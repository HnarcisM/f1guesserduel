import {
    AUTH_PANEL_MARKUP,
    CLASSIC_HEADER_MARKUP,
    EXTENDED_MODE_LEGEND_MARKUP,
    FEEDBACK_PANEL_MARKUP,
    MODE_LABELS
} from './extendedModeShellMarkup.js';

function resolveModeKey(documentObject, requestedModeKey = null) {
    const modeKey = String(requestedModeKey || documentObject?.body?.dataset?.extendedMode || '').trim();
    return Object.hasOwn(MODE_LABELS, modeKey) ? modeKey : null;
}

function removeLegacyStandaloneHeader(documentObject) {
    documentObject.querySelector?.('.mode-page-nav')?.remove?.();
    const legacyAuthButton = documentObject.querySelector?.('#authOpenBtn[hidden]');
    legacyAuthButton?.remove?.();
}

function insertBeforeModeContent(documentObject, markup) {
    const modeContent = documentObject.getElementById?.('modePageContent');
    if (!modeContent || typeof modeContent.insertAdjacentHTML !== 'function') return false;
    modeContent.insertAdjacentHTML('beforebegin', markup);
    return true;
}

function appendToBody(documentObject, markup) {
    const body = documentObject.body;
    if (!body || typeof body.insertAdjacentHTML !== 'function') return false;
    body.insertAdjacentHTML('beforeend', markup);
    return true;
}

function ensureExtendedModeLegend(documentObject) {
    if (documentObject.getElementById?.('extendedModeLegend')) return true;
    const modeContent = documentObject.getElementById?.('modePageContent');
    if (!modeContent || typeof modeContent.insertAdjacentHTML !== 'function') return false;
    modeContent.insertAdjacentHTML('beforeend', EXTENDED_MODE_LEGEND_MARKUP);
    return true;
}

function markCurrentMode(documentObject, modeKey) {
    const currentPath = `/modes/${modeKey}/`;
    documentObject.querySelectorAll?.('[data-mode-path]').forEach(control => {
        const isCurrent = control.dataset?.modePath === currentPath;
        control.classList?.toggle?.('is-current-mode', isCurrent);
        if (isCurrent) control.setAttribute?.('aria-current', 'page');
        else control.removeAttribute?.('aria-current');
    });
}

function updateModeSpecificCopy(documentObject, modeKey) {
    const title = MODE_LABELS[modeKey];
    const feedbackSubtitle = documentObject.getElementById?.('feedbackSettingsSubtitle');
    if (feedbackSubtitle) {
        feedbackSubtitle.textContent = `Aceleași preferințe se aplică interacțiunilor și jocului ${title}.`;
    }
}

function ensureClassicExtendedModeShell({
    documentObject = globalThis.document,
    modeKey: requestedModeKey = null
} = {}) {
    if (!documentObject?.body) return false;
    const modeKey = resolveModeKey(documentObject, requestedModeKey);
    if (!modeKey) return false;

    documentObject.body.classList?.add?.('mode-page-classic-shell');
    removeLegacyStandaloneHeader(documentObject);

    if (!documentObject.querySelector?.('.site-header.mode-page-site-header')) {
        insertBeforeModeContent(documentObject, CLASSIC_HEADER_MARKUP);
    }
    if (!documentObject.getElementById?.('authPanel')) {
        appendToBody(documentObject, AUTH_PANEL_MARKUP);
    }
    if (!documentObject.getElementById?.('feedbackSettingsPanel')) {
        appendToBody(documentObject, FEEDBACK_PANEL_MARKUP);
    }

    markCurrentMode(documentObject, modeKey);
    updateModeSpecificCopy(documentObject, modeKey);
    return true;
}

if (typeof document !== 'undefined' && document.body) {
    ensureClassicExtendedModeShell({ documentObject: document });
}

export {
    ensureClassicExtendedModeShell,
    ensureExtendedModeLegend,
    markCurrentMode,
    resolveModeKey
};
