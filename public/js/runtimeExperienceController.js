(function installRuntimeExperienceController(globalObject) {
    'use strict';

    const DEFAULT_SETTINGS = Object.freeze({
        maintenance: Object.freeze({ enabled: false, message: '' }),
        announcement: Object.freeze({ enabled: false, message: '', level: 'info' }),
        modes: Object.freeze({})
    });
    let snapshot = DEFAULT_SETTINGS;
    let loadPromise = null;
    let pollingTimer = null;
    let restrictionTimer = null;

    function normalize(payload) {
        const source = payload && typeof payload === 'object' ? payload : {};
        return {
            maintenance: {
                enabled: source.maintenance?.enabled === true,
                message: String(source.maintenance?.message || '').trim()
            },
            announcement: {
                enabled: source.announcement?.enabled === true,
                message: String(source.announcement?.message || '').trim(),
                level: ['info', 'warning', 'critical'].includes(source.announcement?.level)
                    ? source.announcement.level
                    : 'info'
            },
            modes: source.modes && typeof source.modes === 'object' ? { ...source.modes } : {},
            updatedAt: source.updatedAt || null,
            generatedAt: source.generatedAt || null
        };
    }

    function ensureAnnouncement(documentObject) {
        let banner = documentObject.getElementById('globalRuntimeAnnouncement');
        if (banner) return banner;
        banner = documentObject.createElement('aside');
        banner.id = 'globalRuntimeAnnouncement';
        banner.className = 'runtime-announcement';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.hidden = true;
        documentObject.body.prepend(banner);
        return banner;
    }


    function ensureRestrictionNotice(documentObject) {
        let notice = documentObject.getElementById('runtimeRestrictionNotice');
        if (notice) return notice;
        notice = documentObject.createElement('aside');
        notice.id = 'runtimeRestrictionNotice';
        notice.className = 'runtime-restriction-notice';
        notice.setAttribute('role', 'alert');
        notice.hidden = true;
        documentObject.body.append(notice);
        return notice;
    }

    function showRestrictionMessage(message, documentObject = globalObject?.document) {
        if (!documentObject?.body) return;
        const notice = ensureRestrictionNotice(documentObject);
        notice.textContent = String(message || 'Acest mod este temporar indisponibil.');
        notice.hidden = false;
        clearTimeout(restrictionTimer);
        restrictionTimer = setTimeout(() => { notice.hidden = true; }, 6_000);
    }

    function ensureMaintenanceOverlay(documentObject) {
        let overlay = documentObject.getElementById('runtimeMaintenanceOverlay');
        if (overlay) return overlay;
        overlay = documentObject.createElement('section');
        overlay.id = 'runtimeMaintenanceOverlay';
        overlay.className = 'runtime-maintenance-overlay';
        overlay.hidden = true;
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'runtimeMaintenanceTitle');
        const panel = documentObject.createElement('div');
        panel.className = 'runtime-maintenance-panel';
        const eyebrow = documentObject.createElement('p'); eyebrow.className = 'runtime-maintenance-eyebrow'; eyebrow.textContent = 'Mentenanță';
        const title = documentObject.createElement('h1'); title.id = 'runtimeMaintenanceTitle'; title.textContent = 'Jocurile sunt temporar indisponibile';
        const message = documentObject.createElement('p'); message.id = 'runtimeMaintenanceMessage';
        const refresh = documentObject.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Verifică din nou'; refresh.addEventListener('click', () => load({ force: true }));
        panel.append(eyebrow, title, message, refresh); overlay.append(panel); documentObject.body.append(overlay);
        return overlay;
    }

    function apply(settings = snapshot, documentObject = globalObject?.document) {
        if (!documentObject?.body) return;
        snapshot = normalize(settings);
        const announcement = ensureAnnouncement(documentObject);
        const showAnnouncement = snapshot.announcement.enabled && Boolean(snapshot.announcement.message);
        announcement.hidden = !showAnnouncement;
        announcement.textContent = showAnnouncement ? snapshot.announcement.message : '';
        announcement.dataset.level = snapshot.announcement.level;

        const maintenance = ensureMaintenanceOverlay(documentObject);
        maintenance.hidden = !snapshot.maintenance.enabled;
        const message = documentObject.getElementById('runtimeMaintenanceMessage');
        if (message) message.textContent = snapshot.maintenance.message || 'Aplicația este temporar în mentenanță.';
        documentObject.body.classList.toggle('runtime-maintenance-active', snapshot.maintenance.enabled);
        documentObject.dispatchEvent(new CustomEvent('f1:runtime-settings', { detail: getSnapshot() }));
    }

    async function load({ force = false } = {}) {
        if (loadPromise) return loadPromise;
        loadPromise = fetch('/api/runtime-settings', { credentials: 'same-origin', cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Runtime settings unavailable.');
                const payload = await response.json();
                apply(payload);
                return getSnapshot();
            })
            .catch(() => getSnapshot())
            .finally(() => { loadPromise = null; });
        return loadPromise;
    }

    function getSnapshot() {
        return normalize(snapshot);
    }

    function isModeEnabled(modeKey) {
        return snapshot.modes?.[modeKey] !== false;
    }

    function isMaintenanceEnabled() {
        return snapshot.maintenance?.enabled === true;
    }

    function startPolling(intervalMs = 30_000) {
        if (pollingTimer) return;
        pollingTimer = setInterval(() => load({ force: true }), intervalMs);
    }

    function installSocketListener() {
        const socket = globalObject?.__f1GameSocket;
        if (!socket?.on || socket.__runtimeSettingsListenerInstalled) return;
        socket.__runtimeSettingsListenerInstalled = true;
        socket.on('runtimeSettingsUpdated', apply);
        socket.on('runtimeRestriction', payload => {
            if (payload?.reason === 'maintenance') {
                apply({ ...getSnapshot(), maintenance: { enabled: true, message: payload.message } });
                return;
            }
            if (payload?.reason === 'mode-disabled' && payload.mode) {
                const current = getSnapshot();
                apply({ ...current, modes: { ...current.modes, [payload.mode]: false } });
                showRestrictionMessage(payload.message);
            }
        });
    }

    const api = Object.freeze({ apply, getSnapshot, isMaintenanceEnabled, isModeEnabled, load, startPolling });
    if (globalObject) globalObject.F1RuntimeSettings = api;
    if (globalObject?.document) {
        const start = () => {
            load();
            startPolling();
            installSocketListener();
            setInterval(installSocketListener, 2_000)?.unref?.();
        };
        if (globalObject.document.readyState === 'loading') globalObject.document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { normalize };
}(typeof globalThis !== 'undefined' ? globalThis : null));
