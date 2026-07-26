'use strict';

const RUNTIME_SETTINGS_KEY = 'operational-controls';
const ANNOUNCEMENT_LEVELS = Object.freeze(['info', 'warning', 'critical']);
const GAME_MODE_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'classic', label: 'Classic' }),
    Object.freeze({ key: 'daily', label: 'Daily Challenge' }),
    Object.freeze({ key: 'duel', label: 'Duel' }),
    Object.freeze({ key: 'speed-run', label: 'Speed Run' }),
    Object.freeze({ key: 'era', label: 'Era Challenge' }),
    Object.freeze({ key: 'streak', label: 'Streak' }),
    Object.freeze({ key: 'weekly', label: 'Weekly Challenge' }),
    Object.freeze({ key: 'constructor', label: 'Constructor Guesser' }),
    Object.freeze({ key: 'pilot-sudoku', label: 'Pilot Sudoku' }),
    Object.freeze({ key: 'track', label: 'Track Guesser' })
]);
const GAME_MODE_KEYS = Object.freeze(GAME_MODE_DEFINITIONS.map(mode => mode.key));

const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
    maintenance: Object.freeze({
        enabled: false,
        message: 'Aplicația este temporar în mentenanță. Revino în câteva minute.'
    }),
    announcement: Object.freeze({
        enabled: false,
        message: '',
        level: 'info'
    }),
    modes: Object.freeze(Object.fromEntries(GAME_MODE_KEYS.map(key => [key, true])))
});

function normalizeMessage(value, maxLength, fallback = '') {
    const message = String(value ?? fallback).trim().replace(/\s+/g, ' ');
    return message.slice(0, maxLength);
}

function normalizeRuntimeSettings(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const maintenanceSource = source.maintenance && typeof source.maintenance === 'object'
        ? source.maintenance
        : {};
    const announcementSource = source.announcement && typeof source.announcement === 'object'
        ? source.announcement
        : {};
    const modesSource = source.modes && typeof source.modes === 'object' ? source.modes : {};
    const announcementLevel = String(announcementSource.level || '').trim().toLowerCase();

    return {
        maintenance: {
            enabled: maintenanceSource.enabled === true,
            message: normalizeMessage(
                maintenanceSource.message,
                240,
                DEFAULT_RUNTIME_SETTINGS.maintenance.message
            ) || DEFAULT_RUNTIME_SETTINGS.maintenance.message
        },
        announcement: {
            enabled: announcementSource.enabled === true,
            message: normalizeMessage(announcementSource.message, 300),
            level: ANNOUNCEMENT_LEVELS.includes(announcementLevel) ? announcementLevel : 'info'
        },
        modes: Object.fromEntries(GAME_MODE_KEYS.map(key => [key, modesSource[key] !== false]))
    };
}

function mergeRuntimeSettings(current, patch = {}) {
    const base = normalizeRuntimeSettings(current);
    const source = patch && typeof patch === 'object' ? patch : {};
    return normalizeRuntimeSettings({
        maintenance: source.maintenance && typeof source.maintenance === 'object'
            ? { ...base.maintenance, ...source.maintenance }
            : base.maintenance,
        announcement: source.announcement && typeof source.announcement === 'object'
            ? { ...base.announcement, ...source.announcement }
            : base.announcement,
        modes: source.modes && typeof source.modes === 'object'
            ? { ...base.modes, ...source.modes }
            : base.modes
    });
}

function validateRuntimeSettingsPatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { ok: false, message: 'Setările operaționale trebuie trimise ca obiect.' };
    }
    if (patch.maintenance && typeof patch.maintenance !== 'object') {
        return { ok: false, message: 'Configurarea maintenance mode nu este validă.' };
    }
    if (patch.announcement && typeof patch.announcement !== 'object') {
        return { ok: false, message: 'Configurarea anunțului global nu este validă.' };
    }
    if (patch.modes && typeof patch.modes !== 'object') {
        return { ok: false, message: 'Configurarea modurilor nu este validă.' };
    }
    if (patch.announcement?.enabled === true && !normalizeMessage(patch.announcement.message, 300)) {
        return { ok: false, message: 'Anunțul global activ trebuie să conțină un mesaj.' };
    }
    if (patch.maintenance?.enabled === true && !normalizeMessage(patch.maintenance.message, 240)) {
        return { ok: false, message: 'Maintenance mode activ trebuie să conțină un mesaj.' };
    }
    if (patch.announcement?.level !== undefined
        && !ANNOUNCEMENT_LEVELS.includes(String(patch.announcement.level).trim().toLowerCase())) {
        return { ok: false, message: 'Nivelul anunțului trebuie să fie info, warning sau critical.' };
    }
    if (patch.modes) {
        const unknownModes = Object.keys(patch.modes).filter(key => !GAME_MODE_KEYS.includes(key));
        if (unknownModes.length > 0) {
            return { ok: false, message: `Moduri necunoscute: ${unknownModes.join(', ')}.` };
        }
        if (Object.values(patch.modes).some(value => typeof value !== 'boolean')) {
            return { ok: false, message: 'Starea fiecărui mod trebuie să fie booleană.' };
        }
    }
    return { ok: true };
}

module.exports = {
    ANNOUNCEMENT_LEVELS,
    DEFAULT_RUNTIME_SETTINGS,
    GAME_MODE_DEFINITIONS,
    GAME_MODE_KEYS,
    RUNTIME_SETTINGS_KEY,
    mergeRuntimeSettings,
    normalizeRuntimeSettings,
    validateRuntimeSettingsPatch
};
