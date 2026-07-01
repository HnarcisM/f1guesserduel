const test = require('node:test');
const assert = require('node:assert/strict');

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
        setAttribute(name, value) { this.attributes[name] = String(value); }
    };
}

function setupNavigationDocument() {
    const menu = createElement({ classes: ['hidden'] });
    const menuButton = createElement();
    const title = createElement();
    const homeItem = createElement({ dataset: { level: 'home' } });
    const easyItem = createElement({ dataset: { level: 'easy' } });

    global.document = {
        getElementById(id) {
            if (id === 'menu-hamburger') return menuButton;
            if (id === 'dropdown-menu') return menu;
            return null;
        },
        querySelector(selector) {
            if (selector === '.site-header h1') return title;
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
