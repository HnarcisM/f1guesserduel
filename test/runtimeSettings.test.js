'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    GAME_MODE_KEYS,
    mergeRuntimeSettings,
    normalizeRuntimeSettings,
    validateRuntimeSettingsPatch
} = require('../server/runtime/runtimeSettingsCatalog');
const { createRuntimeSettingsService } = require('../server/runtime/runtimeSettingsService');


test('runtime settings normalize all supported modes and reject unsafe patches', () => {
    const normalized = normalizeRuntimeSettings({ modes: { duel: false }, announcement: { level: 'CRITICAL' } });
    assert.equal(normalized.modes.duel, false);
    assert.equal(normalized.modes.classic, true);
    assert.deepEqual(Object.keys(normalized.modes), GAME_MODE_KEYS);
    assert.equal(normalized.announcement.level, 'critical');
    assert.equal(validateRuntimeSettingsPatch({ announcement: { enabled: true, message: '' } }).ok, false);
    assert.equal(validateRuntimeSettingsPatch({ modes: { unknown: false } }).ok, false);
    assert.equal(validateRuntimeSettingsPatch({ modes: { classic: false } }).ok, true);
    assert.equal(mergeRuntimeSettings(normalized, { maintenance: { enabled: true } }).maintenance.enabled, true);
});


test('runtime settings service persists updates, emits changes and enforces maintenance and mode flags', async () => {
    let stored = null;
    const emitted = [];
    const repository = {
        async load() { return stored; },
        async save({ settings, updatedBy }) {
            stored = { settings, updatedBy, updatedAt: '2026-07-26T10:00:00.000Z' };
            return stored;
        }
    };
    const service = createRuntimeSettingsService({
        repository,
        io: { emit(event, payload) { emitted.push({ event, payload }); } },
        clock: () => new Date('2026-07-26T10:00:01.000Z'),
        refreshIntervalMs: 0
    });

    await service.refresh({ emit: false });
    assert.equal(service.isModeEnabled('duel'), true);
    const result = await service.update({
        adminUserId: 1,
        patch: {
            maintenance: { enabled: true, message: 'Update server' },
            modes: { duel: false }
        }
    });
    assert.equal(result.ok, true);
    assert.equal(service.getRestriction('classic').reason, 'maintenance');
    assert.equal(emitted.at(-1).event, 'runtimeSettingsUpdated');

    await service.update({ adminUserId: 1, patch: { maintenance: { enabled: false }, modes: { duel: false } } });
    assert.deepEqual(service.getRestriction('duel'), {
        allowed: false,
        reason: 'mode-disabled',
        mode: 'duel',
        message: 'Acest mod este temporar dezactivat de administrator.'
    });
    assert.equal(service.getRestriction('classic').allowed, true);
});

test('runtime settings serializes updates and polling refreshes to avoid stale overwrites', async () => {
    let stored = {
        settings: normalizeRuntimeSettings({ modes: { duel: true } }),
        updatedBy: 1,
        updatedAt: '2026-07-26T09:00:00.000Z'
    };
    let releaseSave;
    let markSaveStarted;
    const saveStarted = new Promise(resolve => { markSaveStarted = resolve; });
    const saveGate = new Promise(resolve => { releaseSave = resolve; });
    const calls = [];
    const repository = {
        async load() {
            calls.push('load');
            return stored;
        },
        async save({ settings, updatedBy }) {
            calls.push('save-start');
            markSaveStarted();
            await saveGate;
            stored = {
                settings,
                updatedBy,
                updatedAt: '2026-07-26T10:00:00.000Z'
            };
            calls.push('save-end');
            return stored;
        }
    };
    const service = createRuntimeSettingsService({ repository, refreshIntervalMs: 0 });
    await service.refresh({ emit: false });
    calls.length = 0;

    const updatePromise = service.update({ adminUserId: 7, patch: { modes: { duel: false } } });
    await saveStarted;
    const refreshPromise = service.refresh({ emit: false });
    releaseSave();

    await Promise.all([updatePromise, refreshPromise]);
    assert.deepEqual(calls, ['save-start', 'save-end', 'load']);
    assert.equal(service.isModeEnabled('duel'), false);
    assert.equal(service.getSnapshot().updatedBy, 7);
});
