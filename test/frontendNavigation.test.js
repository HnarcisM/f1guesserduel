const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function createClassList(initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            return shouldAdd;
        },
        contains(name) { return classes.has(name); }
    };
}

function createElement({ dataset = {}, classes = [], attrs = {} } = {}) {
    const listeners = new Map();
    return {
        dataset: { ...dataset },
        classList: createClassList(classes),
        attributes: { ...attrs },
        disabled: false,
        focus() { global.document.activeElement = this; },
        addEventListener(eventName, handler) { listeners.set(eventName, handler); },
        click() {
            const handler = listeners.get('click');
            if (handler) handler.call(this, {
                target: this,
                stopPropagation() {},
                preventDefault() {},
                stopImmediatePropagation() {}
            });
        },
        getAttribute(name) {
            if (name === 'data-level') return this.dataset.level;
            return this.attributes[name] ?? null;
        },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        listeners
    };
}

function setupNavigationDocument() {
    const menu = createElement({ classes: ['hidden'] });
    const menuButton = createElement();
    const title = createElement();
    const homeItem = createElement({ dataset: { level: 'home' } });
    const easyItem = createElement({ dataset: { level: 'easy' } });
    menu.querySelector = () => homeItem;

    global.document = {
        getElementById(id) {
            if (id === 'menu-hamburger') return menuButton;
            if (id === 'dropdown-menu') return menu;
            return null;
        },
        querySelector(selector) {
            if (selector === '#siteHomeControl') return title;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '.menu-item:not(.theme-item):not(.timer-item):not(.daily-item)') return [homeItem, easyItem];
            if (selector === '.daily-item') return [];
            return [];
        },
        addEventListener() {}
    };

    let reloaded = false;
    global.window = {
        location: {
            reload() { reloaded = true; }
        }
    };

    return { menu, menuButton, title, homeItem, easyItem, wasReloaded: () => reloaded };
}

test('left navigation groups are collapsed native disclosures by default', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(projectRoot, 'public', 'css', '02-header-menu.css'), 'utf8');

    assert.equal((html.match(/<details class="menu-section">/g) || []).length, 4);
    assert.equal((html.match(/<summary class="menu-section-title">/g) || []).length, 4);
    assert.doesNotMatch(html, /<details class="menu-section"[^>]*\sopen(?:\s|>)/);
    assert.match(css, /\.menu-section\[open\] > \.menu-section-content/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(html, /<button[^>]+id="menu-hamburger"[^>]+aria-controls="dropdown-menu"[^>]+aria-expanded="false"/);
    assert.match(html, /<nav[^>]+id="dropdown-menu"[^>]+aria-hidden="true"/);
    assert.equal((html.match(/<button[^>]+class="menu-item(?: [^"]*)?"/g) || []).length, 14);
    assert.doesNotMatch(html, /<div[^>]+class="menu-item/);
    assert.match(html, /<button[^>]+id="shareRoomBtn"/);
    assert.match(html, /<h1><button[^>]+id="siteHomeControl"/);
});

test('menu button synchronizes ARIA state and Escape restores focus', async () => {
    const { setupMenu } = await import('../public/js/navigationMenuController.js');
    const dom = setupNavigationDocument();

    setupMenu({
        startRoundFromSelection() {},
        startDailyChallenge() {},
        confirmDuelExit: () => false
    });

    assert.equal(dom.menu.getAttribute('aria-hidden'), 'true');
    assert.equal(dom.menu.inert, true);
    assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'false');
    dom.menuButton.click();
    assert.equal(dom.menu.classList.contains('hidden'), false);
    assert.equal(dom.menu.getAttribute('aria-hidden'), 'false');
    assert.equal(dom.menu.inert, false);
    assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'true');

    const escapeHandler = dom.menu.listeners.get('keydown');
    escapeHandler({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(dom.menu.classList.contains('hidden'), true);
    assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'false');
    assert.equal(global.document.activeElement, dom.menuButton);
});

test('global clicks keep an open menu visible for disclosure controls and close it outside', async t => {
    const originalDocument = globalThis.document;
    const documentListeners = new Map();
    const insideTarget = { id: '', parent: 'menu' };
    const outsideTarget = { id: 'outside' };
    const menu = createElement();
    menu.contains = target => target?.parent === 'menu';
    globalThis.document = {
        addEventListener(eventName, handler) {
            documentListeners.set(eventName, handler);
        },
        getElementById() {
            return null;
        }
    };
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    });

    const { setupGlobalDocumentEvents } = await import('../public/js/globalDocumentEventsController.js');
    setupGlobalDocumentEvents(menu, {
        autocomplete: { clearSuggestions() {} },
        hideEndGamePopup() {},
        requestRematch() {}
    });

    documentListeners.get('click')({ target: insideTarget });
    assert.equal(menu.classList.contains('hidden'), false);

    documentListeners.get('click')({ target: outsideTarget });
    assert.equal(menu.classList.contains('hidden'), true);
});

test('navigation title does not reload after confirmed Duel exit', async () => {
    const { setupMenu } = await import('../public/js/navigationMenuController.js');
    const dom = setupNavigationDocument();
    let confirmTarget = null;

    setupMenu({
        startRoundFromSelection: () => {},
        startDailyChallenge: () => {},
        confirmDuelExit: (target) => {
            confirmTarget = target;
            return 'left-duel';
        }
    });

    dom.title.click();

    assert.equal(confirmTarget, 'home');
    assert.equal(dom.wasReloaded(), false);
});

test('navigation Home does not reload after cancelled Duel exit', async () => {
    const { setupMenu } = await import('../public/js/navigationMenuController.js');
    const dom = setupNavigationDocument();
    let confirmTarget = null;

    setupMenu({
        startRoundFromSelection: () => {},
        startDailyChallenge: () => {},
        confirmDuelExit: (target) => {
            confirmTarget = target;
            return false;
        }
    });

    dom.homeItem.click();

    assert.equal(confirmTarget, 'home');
    assert.equal(dom.wasReloaded(), false);
});
