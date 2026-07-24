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

test('game variant registry exposes all planned modes in release order', async () => {
    const { registry } = await loadGameHubModules();
    const variants = registry.listGameVariants();

    assert.equal(variants.length, 10);
    assert.deepEqual(
        variants.map(variant => variant.key),
        ['classic', 'daily', 'duel', 'speed-run', 'era', 'streak', 'weekly', 'constructor', 'pilot-sudoku', 'track']
    );
    assert.deepEqual(
        registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE).map(variant => variant.key),
        ['classic', 'daily', 'duel']
    );
    assert.equal(registry.isGameVariantAvailable('speed-run'), false);
    assert.equal(registry.getGameVariant('missing'), null);
    assert.equal(Object.isFrozen(registry.GAME_VARIANTS), true);
});

test('game hub renders available and coming-soon modes without unsafe HTML', async () => {
    const { registry, createGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const controller = createGameHubController({ documentObject, registry });

    assert.equal(controller.render(), true);
    assert.equal(documentObject.root.dataset.gameHubReady, 'true');
    assert.equal(documentObject.root.children.length, 2);

    const elements = flatten(documentObject.root);
    const cards = elements.filter(element => element.dataset?.gameVariant);
    assert.equal(cards.length, 10);

    const availableCards = cards.filter(card => card.dataset.gameModeChoice);
    assert.deepEqual(availableCards.map(card => card.dataset.gameModeChoice), ['single', 'daily', 'duel']);
    assert.equal(availableCards.find(card => card.dataset.gameVariant === 'classic').classList.contains('active'), true);
    assert.equal(availableCards.find(card => card.dataset.gameVariant === 'classic').getAttribute('aria-pressed'), 'true');

    const lockedCards = cards.filter(card => card.disabled);
    assert.equal(lockedCards.length, 7);
    for (const card of lockedCards) {
        assert.equal(card.getAttribute('aria-disabled'), 'true');
        assert.equal(card.dataset.gameModeChoice, undefined);
        assert.equal(card.classList.contains('is-coming-soon'), true);
    }
});

test('mode card uses text nodes and exposes variant metadata', async () => {
    const { registry, createModeCard } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const speedRun = registry.getGameVariant('speed-run');
    const card = createModeCard(documentObject, speedRun);

    assert.equal(card.dataset.gameVariant, 'speed-run');
    assert.equal(card.dataset.gameContext, 'single');
    assert.equal(card.disabled, true);
    assert.match(card.title, /update viitor/i);
    assert.equal(flatten(card).some(element => element.textContent === 'Speed Run'), true);
    assert.equal(flatten(card).some(element => element.textContent === 'În curând'), true);
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
    assert.ok(html.includes('/css/23-game-hub.css'));
    assert.ok(registryIndex > 0);
    assert.ok(controllerIndex > registryIndex);
    assert.ok(bundleIndex > controllerIndex);
});

test('responsive E2E keeps pixel baselines for gameplay and semantic checks for the evolving hub', () => {
    const source = fs.readFileSync(
        path.join(__dirname, 'e2e', 'responsiveVisual.e2e.test.js'),
        'utf8'
    );

    assert.match(source, /assertGameHubCatalog/);
    assert.match(source, /'home', HOME_SELECTORS, \{ compareVisual: false \}/);
    assert.match(source, /'game', GAME_SELECTORS\)/);
    assert.match(source, /catalog\.comingSoon\.length, 7/);
});
