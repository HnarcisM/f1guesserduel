const assert = require('node:assert/strict');
const test = require('node:test');

const { createE2EContext } = require('./e2e/e2eTestHarness');

test('E2E contexts block service workers by default to isolate non-PWA flows', async () => {
    let receivedOptions = null;
    const expectedContext = {};
    const browser = {
        async newContext(options) {
            receivedOptions = options;
            return expectedContext;
        }
    };

    const context = await createE2EContext(browser, {
        viewport: { width: 360, height: 800 }
    });

    assert.equal(context, expectedContext);
    assert.deepEqual(receivedOptions, {
        serviceWorkers: 'block',
        viewport: { width: 360, height: 800 }
    });
});

test('dedicated PWA browser tests may explicitly allow service workers', async () => {
    let receivedOptions = null;
    const browser = {
        async newContext(options) {
            receivedOptions = options;
            return {};
        }
    };

    await createE2EContext(browser, { allowServiceWorkers: true });
    assert.deepEqual(receivedOptions, { serviceWorkers: 'allow' });
});
