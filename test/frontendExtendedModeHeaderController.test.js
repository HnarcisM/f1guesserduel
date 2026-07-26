const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../public/js/extendedModeHeaderController.js');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...names) { names.forEach(name => values.add(name)); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); },
        toggle(name, force) {
            const enabled = force === undefined ? !values.has(name) : Boolean(force);
            if (enabled) values.add(name);
            else values.delete(name);
            return enabled;
        }
    };
}

function createElement(id, { classes = [], dataset = {}, attributes = {} } = {}) {
    const listeners = new Map();
    const element = {
        id,
        dataset: { ...dataset },
        classList: createClassList(classes),
        attributes: { ...attributes },
        textContent: '',
        title: '',
        inert: false,
        focusCount: 0,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatch(type, event = {}) {
            const normalized = {
                target: this,
                preventDefault() {},
                stopPropagation() {},
                stopImmediatePropagation() {},
                ...event
            };
            for (const handler of listeners.get(type) || []) handler.call(this, normalized);
        },
        contains(target) { return target === this; },
        querySelector() { return null; },
        focus() { this.focusCount += 1; }
    };
    return element;
}

function createDocument({ embeddedProfile = false } = {}) {
    const menuButton = createElement('menu-hamburger');
    const firstMenuItem = createElement('firstMenuItem');
    const menu = createElement('dropdown-menu', { classes: ['hidden'] });
    menu.querySelector = () => firstMenuItem;
    const home = createElement('siteHomeControl');
    const profile = createElement('authOpenBtn');
    const authPanel = embeddedProfile ? createElement('authPanel') : null;
    const legacyBadge = createElement('modePageAccount');
    const currentMode = createElement('currentMode', { dataset: { modePath: '/modes/speed-run/' } });
    const otherMode = createElement('otherMode', { dataset: { modePath: '/modes/era/' } });
    const invalidMode = createElement('invalidMode', { dataset: { modePath: 'https://example.com/' } });
    const theme = createElement('themeCarbon', { classes: ['theme-item'], attributes: { 'data-theme': 'carbon' } });
    const root = createElement('documentElement');
    const body = createElement('body');
    const elements = new Map([
        [menuButton.id, menuButton],
        [menu.id, menu],
        [home.id, home],
        [profile.id, profile],
        [legacyBadge.id, legacyBadge],
        ...(authPanel ? [[authPanel.id, authPanel]] : [])
    ]);
    const documentListeners = new Map();
    const documentObject = {
        documentElement: root,
        body,
        getElementById(id) { return elements.get(id) || null; },
        querySelectorAll(selector) {
            if (selector === '[data-mode-path]') return [currentMode, otherMode, invalidMode];
            if (selector === '.theme-item') return [theme];
            return [];
        },
        addEventListener(type, handler) {
            if (!documentListeners.has(type)) documentListeners.set(type, []);
            documentListeners.get(type).push(handler);
        },
        dispatch(type, event = {}) {
            for (const handler of documentListeners.get(type) || []) handler({
                target: body,
                preventDefault() {},
                stopPropagation() {},
                stopImmediatePropagation() {},
                ...event
            });
        }
    };
    return {
        documentObject,
        menuButton,
        menu,
        firstMenuItem,
        home,
        profile,
        authPanel,
        legacyBadge,
        currentMode,
        otherMode,
        invalidMode,
        theme,
        root
    };
}

async function withGlobals(documentObject, localStorage, callback) {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentObject });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
    try {
        return await callback();
    } finally {
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
        else delete globalThis.document;
        if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
        else delete globalThis.localStorage;
    }
}

test('mode page navigation accepts only internal application paths', async () => {
    const { normalizeInternalPath, navigateToPath, navigateHome } = await modulePromise;
    assert.equal(normalizeInternalPath('/modes/era/'), '/modes/era/');
    assert.equal(normalizeInternalPath('//example.com'), null);
    assert.equal(normalizeInternalPath('https://example.com'), null);
    assert.equal(normalizeInternalPath(''), null);

    const emitted = [];
    const assigned = [];
    const socket = { emit(eventName) { emitted.push(eventName); } };
    const windowObject = { location: { assign(pathname) { assigned.push(pathname); } } };

    assert.equal(navigateToPath(windowObject, socket, 'https://example.com'), false);
    assert.equal(navigateToPath(windowObject, socket, '/modes/track/'), true);
    assert.equal(navigateHome(windowObject, socket), true);
    assert.deepEqual(emitted, ['leaveExtendedMode', 'leaveExtendedMode']);
    assert.deepEqual(assigned, ['/modes/track/', '/']);
});

test('account badge renders authenticated and guest states defensively', async () => {
    const { updateAccountBadge } = await modulePromise;
    const fixture = createDocument();

    updateAccountBadge(fixture.documentObject, { username: 'Narcis' });
    assert.equal(fixture.profile.textContent, '👤 Narcis');
    assert.equal(fixture.profile.dataset.authenticated, 'true');
    assert.match(fixture.profile.title, /Narcis/);
    assert.equal(fixture.legacyBadge.textContent, '👤 Narcis');

    updateAccountBadge(fixture.documentObject, null);
    assert.equal(fixture.profile.textContent, '👤 Login');
    assert.equal(fixture.profile.dataset.authenticated, 'false');
    assert.equal(fixture.legacyBadge.textContent, '👤 Guest');
});

test('Classic header opens, closes, applies themes and changes standalone modes safely', async () => {
    const { installClassicHeaderNavigation } = await modulePromise;
    const fixture = createDocument();
    const emitted = [];
    const assigned = [];
    const writes = [];
    const socket = { emit(eventName) { emitted.push(eventName); } };
    const windowObject = {
        location: {
            pathname: '/modes/speed-run/',
            assign(pathname) { assigned.push(pathname); }
        }
    };
    const storage = {
        getItem() { return 'default'; },
        setItem(key, value) { writes.push([key, value]); }
    };

    await withGlobals(fixture.documentObject, storage, () => {
        installClassicHeaderNavigation({ windowObject, documentObject: fixture.documentObject, socket });

        assert.equal(fixture.menu.classList.contains('hidden'), true);
        fixture.menuButton.dispatch('click');
        assert.equal(fixture.menu.classList.contains('hidden'), false);
        fixture.documentObject.dispatch('click', { target: fixture.documentObject.body });
        assert.equal(fixture.menu.classList.contains('hidden'), true);

        fixture.menuButton.dispatch('keydown', { key: 'ArrowDown' });
        assert.equal(fixture.menu.classList.contains('hidden'), false);
        assert.equal(fixture.firstMenuItem.focusCount, 1);
        fixture.menu.dispatch('keydown', { key: 'Escape' });
        assert.equal(fixture.menu.classList.contains('hidden'), true);
        assert.equal(fixture.menuButton.focusCount, 1);

        fixture.theme.dispatch('click');
        assert.equal(fixture.root.getAttribute('data-app-theme'), 'carbon');
        assert.deepEqual(writes, [['f1-guesser-theme', 'carbon']]);

        fixture.currentMode.dispatch('click');
        fixture.invalidMode.dispatch('click');
        assert.deepEqual(assigned, []);
        fixture.otherMode.dispatch('click');
        fixture.home.dispatch('click');
    });

    assert.deepEqual(assigned, ['/modes/era/', '/']);
    assert.deepEqual(emitted, ['leaveExtendedMode', 'leaveExtendedMode']);
});

test('page navigation keeps the legacy profile redirect when no embedded panel exists', async () => {
    const { installPageNavigation } = await modulePromise;
    const fixture = createDocument();
    const emitted = [];
    const assigned = [];
    const sessionWrites = [];
    const socket = { emit(eventName) { emitted.push(eventName); } };
    const windowObject = {
        location: {
            pathname: '/modes/speed-run/',
            assign(pathname) { assigned.push(pathname); }
        },
        sessionStorage: {
            setItem(key, value) { sessionWrites.push([key, value]); }
        }
    };

    await withGlobals(fixture.documentObject, { getItem() { return 'default'; }, setItem() {} }, () => {
        installPageNavigation({ windowObject, documentObject: fixture.documentObject, socket });
        fixture.profile.dispatch('click');
        fixture.documentObject.dispatch('click', {
            target: { closest(selector) { return selector.includes('#extendedModeClose') ? {} : null; } }
        });
    });

    assert.deepEqual(sessionWrites, [['f1-mode-return-path', '/modes/speed-run/']]);
    assert.deepEqual(assigned, ['/#login', '/']);
    assert.deepEqual(emitted, ['leaveExtendedMode', 'leaveExtendedMode']);
});

test('embedded profile button stays on the standalone page and preserves the active mode', async () => {
    const { installPageNavigation } = await modulePromise;
    const fixture = createDocument({ embeddedProfile: true });
    const emitted = [];
    const assigned = [];
    const sessionWrites = [];
    const socket = { emit(eventName) { emitted.push(eventName); } };
    const windowObject = {
        location: {
            pathname: '/modes/speed-run/',
            assign(pathname) { assigned.push(pathname); }
        },
        sessionStorage: {
            setItem(key, value) { sessionWrites.push([key, value]); }
        }
    };

    await withGlobals(fixture.documentObject, { getItem() { return 'default'; }, setItem() {} }, () => {
        installPageNavigation({ windowObject, documentObject: fixture.documentObject, socket });
        fixture.profile.dispatch('click');
    });

    assert.deepEqual(sessionWrites, []);
    assert.deepEqual(assigned, []);
    assert.deepEqual(emitted, []);
});
