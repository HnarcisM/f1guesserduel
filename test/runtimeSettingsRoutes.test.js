'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntimeSettingsRoutes } = require('../server/routes/runtimeSettingsRoutes');


test('public runtime settings route returns only the safe snapshot with no-store caching', () => {
    const router = createRuntimeSettingsRoutes({
        runtimeSettingsService: {
            getPublicSettings() { return { maintenance: { enabled: false }, modes: { duel: true } }; }
        }
    });
    const route = router.stack.find(layer => layer.route?.path === '/runtime-settings');
    const headers = {};
    let payload = null;
    route.route.stack[0].handle({}, {
        set(name, value) { headers[name] = value; },
        json(value) { payload = value; return value; }
    });
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.deepEqual(payload, { maintenance: { enabled: false }, modes: { duel: true } });
});
