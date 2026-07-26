'use strict';

const { createRuntimeSettingsRepository } = require('./runtimeSettingsRepository');
const {
    DEFAULT_RUNTIME_SETTINGS,
    GAME_MODE_KEYS,
    mergeRuntimeSettings,
    normalizeRuntimeSettings,
    validateRuntimeSettingsPatch
} = require('./runtimeSettingsCatalog');

function stableSerialize(value) {
    return JSON.stringify(value);
}

function createRuntimeSettingsService({
    database,
    repository = null,
    io = null,
    logger = console,
    refreshIntervalMs = 30_000,
    clock = () => new Date(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
} = {}) {
    const settingsRepository = repository || createRuntimeSettingsRepository(database);
    let state = {
        settings: normalizeRuntimeSettings(DEFAULT_RUNTIME_SETTINGS),
        updatedBy: null,
        updatedAt: null
    };
    let refreshTimer = null;
    let refreshPromise = null;
    let operationQueue = Promise.resolve();

    function runExclusive(operation) {
        const queued = operationQueue.then(operation, operation);
        operationQueue = queued.catch(() => null);
        return queued;
    }

    function getSnapshot() {
        return {
            settings: normalizeRuntimeSettings(state.settings),
            updatedBy: state.updatedBy,
            updatedAt: state.updatedAt
        };
    }

    function getPublicSettings() {
        return {
            ...normalizeRuntimeSettings(state.settings),
            updatedAt: state.updatedAt,
            generatedAt: clock().toISOString()
        };
    }

    function emitUpdate() {
        io?.emit?.('runtimeSettingsUpdated', getPublicSettings());
    }

    async function refresh({ emit = true } = {}) {
        if (refreshPromise) return refreshPromise;
        refreshPromise = runExclusive(async () => {
            const record = await settingsRepository.load();
            const next = record || {
                settings: normalizeRuntimeSettings(DEFAULT_RUNTIME_SETTINGS),
                updatedBy: null,
                updatedAt: null
            };
            const normalizedNext = {
                settings: normalizeRuntimeSettings(next.settings),
                updatedBy: next.updatedBy || null,
                updatedAt: next.updatedAt || null
            };
            const changed = stableSerialize(normalizedNext) !== stableSerialize(state);
            state = normalizedNext;
            if (changed && emit) emitUpdate();
            return getSnapshot();
        }).finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    }

    async function update({ patch, adminUserId }) {
        const validation = validateRuntimeSettingsPatch(patch);
        if (!validation.ok) return validation;
        return runExclusive(async () => {
            const settings = mergeRuntimeSettings(state.settings, patch);
            const saved = await settingsRepository.save({ settings, updatedBy: adminUserId });
            state = {
                settings: normalizeRuntimeSettings(saved.settings),
                updatedBy: saved.updatedBy || adminUserId || null,
                updatedAt: saved.updatedAt || clock().toISOString()
            };
            emitUpdate();
            return { ok: true, ...getSnapshot() };
        });
    }

    function isModeEnabled(modeKey) {
        return GAME_MODE_KEYS.includes(modeKey) && state.settings.modes[modeKey] !== false;
    }

    function isMaintenanceEnabled() {
        return state.settings.maintenance.enabled === true;
    }

    function getRestriction(modeKey = null) {
        if (isMaintenanceEnabled()) {
            return {
                allowed: false,
                reason: 'maintenance',
                message: state.settings.maintenance.message
            };
        }
        if (modeKey && !isModeEnabled(modeKey)) {
            return {
                allowed: false,
                reason: 'mode-disabled',
                mode: modeKey,
                message: 'Acest mod este temporar dezactivat de administrator.'
            };
        }
        return { allowed: true };
    }

    function start() {
        if (refreshTimer || Number(refreshIntervalMs) <= 0) return stop;
        refreshTimer = setIntervalFn(() => {
            refresh().catch(error => logger?.error?.('[runtime-settings] Refresh failed.', { error }));
        }, Number(refreshIntervalMs));
        refreshTimer?.unref?.();
        return stop;
    }

    function stop() {
        if (!refreshTimer) return;
        clearIntervalFn(refreshTimer);
        refreshTimer = null;
    }

    return {
        getPublicSettings,
        getRestriction,
        getSnapshot,
        isMaintenanceEnabled,
        isModeEnabled,
        refresh,
        start,
        stop,
        update
    };
}

module.exports = {
    createRuntimeSettingsService
};
