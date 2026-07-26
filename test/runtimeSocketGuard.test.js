'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createRuntimeSocketGuard,
    resolveSocketEventMode
} = require('../server/runtime/runtimeSocketGuard');


test('runtime socket guard maps classic, daily, duel and extended events', () => {
    assert.equal(resolveSocketEventMode('startSingleGame'), 'classic');
    assert.equal(resolveSocketEventMode('startDailyChallenge'), 'daily');
    assert.equal(resolveSocketEventMode('joinRoom'), 'duel');
    assert.equal(resolveSocketEventMode('startExtendedMode', [{ variantKey: 'track' }]), 'track');
    assert.equal(resolveSocketEventMode('submitExtendedGuess', [], 'weekly'), 'weekly');
    assert.equal(resolveSocketEventMode('refreshAuthUser'), null);
});


test('runtime socket guard blocks only game events and emits a public restriction', () => {
    const emitted = [];
    const guard = createRuntimeSocketGuard({
        runtimeSettingsService: {
            getRestriction(mode) {
                return mode === 'duel'
                    ? { allowed: false, reason: 'mode-disabled', mode, message: 'Duel oprit' }
                    : { allowed: true };
            }
        },
        extendedSessions: new Map()
    });
    assert.equal(guard.evaluate({ eventName: 'refreshAuthUser', socketId: 's1' }).allowed, true);
    const decision = guard.evaluate({ eventName: 'joinRoom', socketId: 's1' });
    assert.equal(decision.allowed, false);
    guard.notify({ emit(event, payload) { emitted.push({ event, payload }); } }, decision);
    assert.deepEqual(emitted, [{
        event: 'runtimeRestriction',
        payload: { reason: 'mode-disabled', mode: 'duel', message: 'Duel oprit' }
    }]);
});

test('runtime guarded registrar rejects blocked events before their handlers and acknowledges safely', async () => {
    const { createRuntimeGuardedEventRegistrar } = require('../server/socket/runtimeGuardedEventRegistrar');
    const emitted = [];
    const registered = new Map();
    const socket = {
        id: 'socket-1',
        emit(event, payload) { emitted.push({ event, payload }); }
    };
    const onSocketEvent = createRuntimeGuardedEventRegistrar({
        socket,
        coordinateEventHandler: (_eventName, handler) => handler,
        socketEventRateLimiter: {
            register(_socket, eventName, handler) { registered.set(eventName, handler); }
        },
        runtimeSettingsService: {
            getRestriction(mode) {
                return mode === 'classic'
                    ? { allowed: false, reason: 'maintenance', message: 'Mentenanță' }
                    : { allowed: true };
            }
        },
        extendedSessions: new Map()
    });
    let executions = 0;
    onSocketEvent('startSingleGame', async () => { executions += 1; });
    let acknowledgement = null;
    await registered.get('startSingleGame')({}, payload => { acknowledgement = payload; });

    assert.equal(executions, 0);
    assert.deepEqual(acknowledgement, {
        ok: false,
        message: 'Mentenanță',
        reason: 'maintenance'
    });
    assert.deepEqual(emitted, [{
        event: 'runtimeRestriction',
        payload: { reason: 'maintenance', mode: null, message: 'Mentenanță' }
    }]);
});
