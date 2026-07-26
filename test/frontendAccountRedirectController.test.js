const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const modulePromise = import('../public/js/accountRedirectController.js');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...names) { names.forEach(name => values.add(name)); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); }
    };
}

function createFixture({ hash = '#login', returnPath = '/modes/speed-run/' } = {}) {
    const assigned = [];
    const removedKeys = [];
    const historyCalls = [];
    const panel = { classList: createClassList() };
    let clickCount = 0;
    const openButton = {
        click() {
            clickCount += 1;
            panel.classList.add('show');
        }
    };
    const storage = new Map();
    if (returnPath !== null) storage.set('f1-mode-return-path', returnPath);
    const documentObject = {
        getElementById(id) {
            if (id === 'authOpenBtn') return openButton;
            if (id === 'authPanel') return panel;
            return null;
        }
    };
    const windowObject = {
        document: documentObject,
        location: {
            hash,
            pathname: '/',
            search: '?source=speed-run',
            assign(pathname) { assigned.push(pathname); }
        },
        history: {
            state: { page: 'main' },
            replaceState(...args) { historyCalls.push(args); }
        },
        sessionStorage: {
            getItem(key) { return storage.get(key) ?? null; },
            removeItem(key) {
                removedKeys.push(key);
                storage.delete(key);
            }
        }
    };
    return {
        assigned,
        documentObject,
        getClickCount: () => clickCount,
        historyCalls,
        panel,
        removedKeys,
        windowObject
    };
}

class FakeMutationObserver {
    static instances = [];

    constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        FakeMutationObserver.instances.push(this);
    }

    observe(target, options) {
        this.target = target;
        this.options = options;
    }

    disconnect() {
        this.disconnected = true;
    }

    trigger() {
        this.callback([]);
    }
}

test('Speed Run account redirect opens the profile and returns after the panel closes', async () => {
    const { openRequestedAccountPanel } = await modulePromise;
    FakeMutationObserver.instances = [];
    const fixture = createFixture();

    assert.equal(openRequestedAccountPanel({
        windowObject: fixture.windowObject,
        documentObject: fixture.documentObject,
        MutationObserverClass: FakeMutationObserver
    }), true);

    assert.equal(fixture.getClickCount(), 1);
    assert.equal(fixture.panel.classList.contains('show'), true);
    assert.deepEqual(fixture.removedKeys, ['f1-mode-return-path']);
    assert.deepEqual(fixture.historyCalls, [[{ page: 'main' }, '', '/?source=speed-run']]);

    const observer = FakeMutationObserver.instances[0];
    assert.ok(observer);
    assert.equal(observer.target, fixture.panel);
    assert.deepEqual(observer.options, { attributes: true, attributeFilter: ['class'] });

    fixture.panel.classList.remove('show');
    observer.trigger();

    assert.deepEqual(fixture.assigned, ['/modes/speed-run/']);
    assert.equal(observer.disconnected, true);
});

test('account redirect waits until the main bundle installs the profile handler', async () => {
    const { openRequestedAccountPanel } = await modulePromise;
    const fixture = createFixture();
    fixture.documentObject.getElementById = id => {
        if (id === 'authOpenBtn') return { click() {} };
        if (id === 'authPanel') return fixture.panel;
        return null;
    };

    assert.equal(openRequestedAccountPanel({
        windowObject: fixture.windowObject,
        documentObject: fixture.documentObject,
        MutationObserverClass: FakeMutationObserver
    }), false);
    assert.deepEqual(fixture.removedKeys, []);
    assert.deepEqual(fixture.historyCalls, []);
});

test('account redirect ignores unrelated hashes and rejects unsafe return paths', async () => {
    const {
        normalizeModeReturnPath,
        openRequestedAccountPanel
    } = await modulePromise;
    const fixture = createFixture({ hash: '#results' });

    assert.equal(openRequestedAccountPanel({
        windowObject: fixture.windowObject,
        documentObject: fixture.documentObject,
        MutationObserverClass: FakeMutationObserver
    }), false);
    assert.equal(fixture.getClickCount(), 0);
    assert.deepEqual(fixture.removedKeys, []);

    assert.equal(normalizeModeReturnPath('/modes/speed-run/'), '/modes/speed-run/');
    assert.equal(normalizeModeReturnPath('/modes/era/index.html'), '/modes/era/');
    assert.equal(normalizeModeReturnPath('//example.com/modes/speed-run/'), null);
    assert.equal(normalizeModeReturnPath('https://example.com/modes/speed-run/'), null);
    assert.equal(normalizeModeReturnPath('/admin/'), null);
    assert.equal(normalizeModeReturnPath('/modes/unknown/'), null);
});

test('main page loads the account redirect controller after the game bundle', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
    const bundleIndex = html.indexOf('/game.bundle.min.js');
    const redirectIndex = html.indexOf('/js/accountRedirectController.js');

    assert.ok(bundleIndex >= 0);
    assert.ok(redirectIndex > bundleIndex);
});
