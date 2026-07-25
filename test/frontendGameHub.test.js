const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function loadGameHubModules() {
    await import('../public/js/gameVariantRegistry.js');
    await import('../public/js/gameHubController.js');
    return {
        registry: globalThis.F1GameVariantRegistry,
        ...globalThis.F1GameHub
    };
}

function createClassList(element, classes) {
    function sync() {
        element._className = [...classes].join(' ');
    }
    return {
        add(...names) {
            for (const name of names) classes.add(name);
            sync();
        },
        remove(...names) {
            for (const name of names) classes.delete(name);
            sync();
        },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            sync();
            return shouldAdd;
        },
        contains(name) {
            return classes.has(name);
        }
    };
}

function createFakeElement(tagName = 'div') {
    const attributes = new Map();
    const listeners = new Map();
    const element = {
        tagName: tagName.toUpperCase(),
        children: [],
        dataset: {},
        textContent: '',
        type: '',
        title: '',
        disabled: false,
        className: '',
        append(...children) {
            this.children.push(...children);
        },
        replaceChildren(...children) {
            this.children = [...children];
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        async trigger(name, event) {
            return listeners.get(name)?.(event);
        }
    };
    const classes = new Set();
    const classList = createClassList(element, classes);
    Object.defineProperty(element, 'className', {
        get() {
            return this._className || '';
        },
        set(value) {
            classes.clear();
            String(value || '').split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
            this._className = [...classes].join(' ');
        },
        configurable: true
    });
    element.classList = classList;
    return element;
}

function createFakeDocument() {
    const root = createFakeElement('div');
    root.id = 'gameModeHub';
    return {
        root,
        createElement: createFakeElement,
        getElementById(id) {
            return id === 'gameModeHub' ? root : null;
        },
        addEventListener() {}
    };
}

function flatten(element) {
    return [element, ...element.children.flatMap(flatten)];
}

test('game variant registry exposes every planned mode as playable in release order', async () => {
    const { registry } = await loadGameHubModules();
    const variants = registry.listGameVariants();

    assert.equal(variants.length, 10);
    assert.deepEqual(
        variants.map(variant => variant.key),
        ['classic', 'daily', 'duel', 'speed-run', 'era', 'streak', 'weekly', 'constructor', 'pilot-sudoku', 'track']
    );
    assert.deepEqual(
        registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE).map(variant => variant.key),
        variants.map(variant => variant.key)
    );
    assert.equal(registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.COMING_SOON).length, 0);
    assert.equal(registry.isGameVariantAvailable('speed-run'), true);
    assert.equal(registry.isGameVariantAvailable('track'), true);
    assert.equal(registry.getGameVariant('missing'), null);
    assert.equal(Object.isFrozen(registry.GAME_VARIANTS), true);
});

test('game hub renders all ten modes as enabled cards without unsafe HTML', async () => {
    const { registry, createGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const controller = createGameHubController({ documentObject, registry });

    assert.equal(controller.render(), true);
    assert.equal(documentObject.root.dataset.gameHubReady, 'true');
    assert.equal(documentObject.root.children.length, 1);

    const elements = flatten(documentObject.root);
    const cards = elements.filter(element => element.dataset?.gameVariant);
    assert.equal(cards.length, 10);

    const classicCards = cards.filter(card => card.dataset.gameModeChoice);
    assert.deepEqual(classicCards.map(card => card.dataset.gameModeChoice), ['single', 'daily', 'duel']);
    assert.equal(classicCards.every(card => card.classList.contains('active') === false), true);
    assert.equal(classicCards.every(card => card.getAttribute('aria-pressed') === 'false'), true);

    const extendedCards = cards.filter(card => card.dataset.gameModePage);
    assert.deepEqual(
        extendedCards.map(card => card.dataset.gameVariant),
        ['speed-run', 'era', 'streak', 'weekly', 'constructor', 'pilot-sudoku', 'track']
    );
    assert.equal(extendedCards.every(card => card.tagName === 'BUTTON'), true);
    assert.equal(cards.filter(card => card.disabled).length, 0);
    assert.equal(cards.every(card => flatten(card).some(element => element.textContent === 'Disponibil')), true);
});

test('extended mode card exposes launch metadata and remains keyboard enabled', async () => {
    const { registry, createModeCard } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const speedRun = registry.getGameVariant('speed-run');
    const card = createModeCard(documentObject, speedRun);

    assert.equal(card.dataset.gameVariant, 'speed-run');
    assert.equal(card.dataset.gameContext, 'single');
    assert.equal(card.dataset.gameModePage, '/modes/speed-run/');
    assert.equal(card.tagName, 'BUTTON');
    assert.equal(card.dataset.gameModeChoice, undefined);
    assert.equal(card.disabled, false);
    assert.equal(card.getAttribute('aria-pressed'), null);
    assert.equal(flatten(card).some(element => element.textContent === 'Speed Run'), true);
    assert.equal(flatten(card).some(element => element.textContent === 'Disponibil'), true);
});

test('extended mode cards navigate to dedicated pages without loading the game controller', async () => {
    const { registry, createGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const navigations = [];
    const controller = createGameHubController({
        documentObject,
        registry,
        windowObject: { location: { assign: path => navigations.push(path) } }
    });
    controller.render();

    const trackCard = flatten(documentObject.root)
        .find(element => element.dataset?.gameVariant === 'track');
    assert.equal(trackCard.tagName, 'BUTTON');
    assert.equal(trackCard.dataset.gameModePage, '/modes/track/');
    await documentObject.root.trigger('click', {
        target: {
            closest(selector) {
                return selector === '[data-game-mode-page]' ? trackCard : null;
            }
        }
    });
    assert.deepEqual(navigations, ['/modes/track/']);
});

test('game hub installer is idempotent', async () => {
    const { registry, installGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const windowObject = {
        document: documentObject,
        F1GameVariantRegistry: registry
    };

    const first = installGameHubController(windowObject);
    const second = installGameHubController(windowObject);

    assert.ok(first);
    assert.equal(second, first);
    assert.equal(documentObject.root.dataset.gameHubReady, 'true');
});


test('production HTML loads the Game Hub before the existing game bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const registryIndex = html.indexOf('/js/gameVariantRegistry.js');
    const controllerIndex = html.indexOf('/js/gameHubController.js');
    const bundleIndex = html.indexOf('/game.bundle.min.js');

    assert.ok(html.includes('id="gameModeHub"'));
    assert.ok(html.includes('id="gameHubCatalogView"'));
    assert.ok(html.includes('id="gameHubSetupView"'));
    assert.ok(html.includes('id="gameHubBackBtn"'));
    assert.match(html, /id="difficultySection" class="difficulty-section is-hidden"/);
    assert.ok(html.includes('/css/23-game-hub.css'));
    assert.ok(registryIndex > 0);
    assert.ok(controllerIndex > registryIndex);
    assert.ok(bundleIndex > controllerIndex);
});

test('responsive E2E expects all planned modes to be enabled', () => {
    const source = fs.readFileSync(
        path.join(__dirname, 'e2e', 'responsiveVisual.e2e.test.js'),
        'utf8'
    );

    assert.match(source, /assertGameHubCatalog/);
    assert.match(source, /catalog\.available\.length, 10/);
    assert.match(source, /catalog\.comingSoon\.length, 0/);
    assert.match(source, /assertExtendedModesLaunch/);
    assert.match(source, /card\.dataset\.gameModeChoice \|\| card\.dataset\.gameVariant/);
});
