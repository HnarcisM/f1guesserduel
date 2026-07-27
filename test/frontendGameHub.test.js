const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function loadGameHubModules() {
    await import('../public/js/gameVariantRegistry.js');
    await import('../public/js/gameHubDashboardView.js');
    await import('../public/js/gameHubController.js');
    return {
        registry: globalThis.F1GameVariantRegistry,
        dashboardView: globalThis.F1GameHubDashboardView,
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
        removeAttribute(name) {
            attributes.delete(name);
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const matches = [];
            const byClass = selector.startsWith('.') ? selector.slice(1) : null;
            const byVariant = selector === '[data-game-variant]';
            const byId = selector.startsWith('#') ? selector.slice(1) : null;
            function visit(node) {
                if ((byClass && node.classList?.contains(byClass))
                    || (byVariant && node.dataset?.gameVariant)
                    || (byId && node.id === byId)) {
                    matches.push(node);
                }
                for (const child of node.children || []) visit(child);
            }
            visit(this);
            return matches;
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
    const authButton = createFakeElement('button');
    root.id = 'gameModeHub';
    authButton.id = 'authOpenBtn';
    return {
        root,
        authButton,
        createElement: createFakeElement,
        getElementById(id) {
            if (id === 'gameModeHub') return root;
            if (id === 'authOpenBtn') return authButton;
            return flatten(root).find(element => element.id === id) || null;
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
    assert.equal(typeof registry.HUB_GROUPS.SINGLE, 'string');
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
    assert.deepEqual(
        registry.listGameVariantsByGroup(registry.HUB_GROUPS.SINGLE).map(variant => variant.key),
        ['classic', 'daily', 'era', 'weekly']
    );
    assert.deepEqual(
        registry.listGameVariantsByGroup(registry.HUB_GROUPS.SPECIALTY).map(variant => variant.key),
        ['speed-run', 'streak', 'constructor', 'pilot-sudoku', 'track']
    );
});

test('game hub renders the dashboard layout with all ten enabled cards', async () => {
    const { registry, createGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const controller = createGameHubController({ documentObject, registry });

    assert.equal(controller.render(), true);
    assert.equal(documentObject.root.dataset.gameHubReady, 'true');
    assert.equal(documentObject.root.children.length, 1);

    const elements = flatten(documentObject.root);
    const cards = elements.filter(element => element.dataset?.gameVariant);
    const dashboard = elements.find(element => element.classList?.contains('game-hub-dashboard'));
    const summaryItems = elements.filter(element => element.classList?.contains('game-hub-summary-item'));
    const featuredDuel = elements.find(element => element.classList?.contains('game-hub-featured-card'));
    assert.ok(dashboard);
    assert.equal(cards.length, 10);
    assert.equal(summaryItems.length, 5);
    assert.ok(featuredDuel);
    assert.ok(elements.find(element => element.id === 'gameHubProfileSummary'));
    assert.equal(elements.find(element => element.id === 'gameHubProfileUsername')?.textContent, 'Guest');
    assert.equal(elements.find(element => element.id === 'gameHubProfileLevel')?.textContent, 'Nivel —');
    assert.deepEqual(
        ['gameHubProfileVictories', 'gameHubProfileWinRate', 'gameHubProfileCurrentStreak', 'gameHubProfilePlayed']
            .map(id => elements.find(element => element.id === id)?.textContent),
        ['—', '—', '—', '—']
    );

    const classicCards = cards.filter(card => card.dataset.gameModeChoice);
    assert.deepEqual(classicCards.map(card => card.dataset.gameModeChoice), ['single', 'daily', 'duel']);
    assert.equal(classicCards.every(card => card.classList.contains('active') === false), true);
    assert.equal(classicCards.every(card => card.getAttribute('aria-pressed') === 'false'), true);

    const extendedCards = cards.filter(card => card.dataset.gameModePage);
    assert.deepEqual(
        extendedCards.map(card => card.dataset.gameVariant),
        ['era', 'weekly', 'speed-run', 'streak', 'constructor', 'pilot-sudoku', 'track']
    );
    assert.equal(extendedCards.every(card => card.tagName === 'BUTTON'), true);
    assert.equal(cards.filter(card => card.disabled).length, 0);
    assert.equal(cards.every(card => flatten(card).some(element => element.textContent === 'Disponibil')), true);
    assert.equal(featuredDuel.dataset.gameModeChoice, 'duel');
    assert.equal(featuredDuel.tagName, 'BUTTON');
});

test('profile header and summary render authenticated account data without unsafe HTML', async () => {
    const { registry, createGameHubController, dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const controller = createGameHubController({ documentObject, registry });
    controller.render();

    const user = { username: '<Mihai>', avatarKey: 'helmet-blue' };
    dashboardView.ensureHeaderProfileMarkup(documentObject, user);
    dashboardView.renderProfileSnapshot(documentObject, user, {
        stats: {
            totals: { played: 34, won: 21, winRate: 62 },
            modes: {
                single: { currentStreak: 4 },
                daily: { currentStreak: 2 },
                duel: { currentStreak: 7 }
            }
        },
        progress: {
            level: 8,
            xpIntoLevel: 350,
            xpForLevel: 600,
            progressPercent: 58
        }
    });

    assert.equal(documentObject.authButton.querySelector('#authHeaderUsername').textContent, '<Mihai>');
    assert.equal(documentObject.authButton.querySelector('#authHeaderAvatar').dataset.avatarKey, 'helmet-blue');
    assert.equal(documentObject.authButton.classList.contains('is-authenticated'), true);
    assert.equal(documentObject.getElementById('gameHubProfileUsername').textContent, '<Mihai>');
    assert.equal(documentObject.getElementById('gameHubProfileLevel').textContent, 'Nivel 8');
    assert.equal(documentObject.getElementById('gameHubProfileXpText').textContent, '350 / 600 XP');
    assert.equal(documentObject.getElementById('gameHubProfileXpBar').dataset.progressPercent, '58');
    assert.equal(documentObject.getElementById('gameHubProfileVictories').textContent, '21');
    assert.equal(documentObject.getElementById('gameHubProfileWinRate').textContent, '62%');
    assert.equal(documentObject.getElementById('gameHubProfileCurrentStreak').textContent, '7');
    assert.equal(documentObject.getElementById('gameHubProfilePlayed').textContent, '34');

    dashboardView.ensureHeaderProfileMarkup(documentObject, { username: 'Mihai', avatarKey: 'invalid-value' });
    assert.equal(documentObject.authButton.querySelector('#authHeaderAvatar').dataset.avatarKey, 'helmet-red');
});

test('profile summary consumes live account stats only for the authenticated user', async () => {
    const { registry, createGameHubController, dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    createGameHubController({ documentObject, registry }).render();

    const listeners = new Map();
    const socket = {
        on(eventName, handler) { listeners.set(eventName, handler); },
        off(eventName, handler) {
            if (listeners.get(eventName) === handler) listeners.delete(eventName);
        }
    };
    const originalSocket = globalThis.__f1GameSocket;
    globalThis.__f1GameSocket = socket;
    const fetchImpl = async url => ({
        ok: true,
        async json() {
            if (url === '/api/auth/me') {
                return { user: { id: 7, username: 'Narcis', avatarKey: 'helmet-green' } };
            }
            return {
                user: { id: 7, username: 'Narcis', avatarKey: 'helmet-green' },
                stats: { totals: { played: 5, won: 3, winRate: 60 }, modes: {} },
                progress: { level: 2, xpIntoLevel: 150, xpForLevel: 300, progressPercent: 50 }
            };
        }
    });

    let sync = null;
    try {
        sync = dashboardView.installGameHubProfileSync({
            documentObject,
            fetchImpl,
            MutationObserverClass: null
        });
        await sync.refresh();

        const update = listeners.get('accountStatsUpdated');
        assert.equal(typeof update, 'function');
        update({
            userId: 7,
            stats: {
                totals: { played: 6, won: 4, winRate: 67 },
                modes: { single: { currentStreak: 3 } }
            },
            progress: { level: 2, xpIntoLevel: 180, xpForLevel: 300, progressPercent: 60 }
        });
        assert.equal(documentObject.getElementById('gameHubProfileVictories').textContent, '4');
        assert.equal(documentObject.getElementById('gameHubProfilePlayed').textContent, '6');
        assert.equal(documentObject.getElementById('gameHubProfileXpBar').dataset.progressPercent, '60');

        update({
            userId: 8,
            stats: { totals: { played: 99, won: 99, winRate: 100 }, modes: {} },
            progress: { level: 99, xpIntoLevel: 0, xpForLevel: 100, progressPercent: 0 }
        });
        assert.equal(documentObject.getElementById('gameHubProfileVictories').textContent, '4');
        assert.equal(documentObject.getElementById('gameHubProfilePlayed').textContent, '6');
    } finally {
        sync?.disconnect();
        if (originalSocket === undefined) delete globalThis.__f1GameSocket;
        else globalThis.__f1GameSocket = originalSocket;
    }

    assert.equal(listeners.has('accountStatsUpdated'), false);
});

test('game hub disables a mode immediately when runtime settings turn it off', async () => {
    const { registry, createModeCard } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const duel = registry.getGameVariant('duel');
    const card = createModeCard(documentObject, duel, {
        isModeEnabled(modeKey) { return modeKey !== 'duel'; }
    });

    assert.equal(card.disabled, true);
    assert.equal(card.dataset.gameModeChoice, 'duel');
    assert.equal(card.classList.contains('is-runtime-disabled'), true);
    assert.equal(card.getAttribute('aria-disabled'), 'true');
    assert.equal(flatten(card).some(element => element.textContent === 'Dezactivat'), true);
});

test('runtime refresh updates existing cards without replacing their click-bound DOM nodes', async () => {
    const { registry, createGameHubController } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const disabledModes = new Set();
    const windowObject = {
        F1RuntimeSettings: {
            isModeEnabled(modeKey) {
                return !disabledModes.has(modeKey);
            }
        }
    };
    const controller = createGameHubController({ documentObject, registry, windowObject });

    controller.render();
    const initialCards = flatten(documentObject.root)
        .filter(element => element.dataset?.gameVariant);
    const classic = initialCards.find(card => card.dataset.gameVariant === 'classic');
    const daily = initialCards.find(card => card.dataset.gameVariant === 'daily');
    const duel = initialCards.find(card => card.dataset.gameVariant === 'duel');
    let dailyClicks = 0;
    daily.addEventListener('click', () => { dailyClicks += 1; });

    disabledModes.add('daily');
    controller.render();
    const refreshedCards = flatten(documentObject.root)
        .filter(element => element.dataset?.gameVariant);

    assert.equal(refreshedCards.find(card => card.dataset.gameVariant === 'classic'), classic);
    assert.equal(refreshedCards.find(card => card.dataset.gameVariant === 'daily'), daily);
    assert.equal(refreshedCards.find(card => card.dataset.gameVariant === 'duel'), duel);
    assert.equal(daily.disabled, true);
    assert.equal(daily.classList.contains('is-runtime-disabled'), true);
    assert.equal(daily.dataset.gameModeChoice, 'daily');

    disabledModes.delete('daily');
    controller.render();
    assert.equal(daily.disabled, false);
    assert.equal(daily.classList.contains('is-runtime-disabled'), false);
    assert.equal(daily.getAttribute('aria-disabled'), null);
    assert.equal(flatten(daily).some(element => element.textContent === 'Disponibil'), true);
    await daily.trigger('click', { target: daily });
    assert.equal(dailyClicks, 1, 'listenerul atașat înainte de refresh trebuie păstrat');
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
    const viewIndex = html.indexOf('/js/gameHubDashboardView.js');
    const controllerIndex = html.indexOf('/js/gameHubController.js');
    const bundleIndex = html.indexOf('/game.bundle.min.js');

    assert.ok(html.includes('id="gameModeHub"'));
    assert.ok(html.includes('id="gameHubCatalogView"'));
    assert.ok(html.includes('id="gameHubSetupView"'));
    assert.ok(html.includes('id="gameHubBackBtn"'));
    assert.match(html, /id="difficultySection" class="difficulty-section is-hidden"/);
    assert.ok(html.includes('/css/23-game-hub.css'));
    assert.ok(html.includes('/css/29-game-hub-dashboard.css'));
    const authStylesIndex = html.indexOf('/css/08-auth.css');
    const mobileStylesIndex = html.indexOf('/css/11-mobile-layout-fix.css');
    const authViewportFixIndex = html.indexOf('/css/14-auth-panel-viewport-fix.css');

    assert.ok(html.includes('/css/02-header-menu.css'));
    assert.ok(authStylesIndex > 0);
    assert.ok(mobileStylesIndex > authStylesIndex);
    assert.ok(authViewportFixIndex > mobileStylesIndex);
    assert.ok(registryIndex > 0);
    assert.ok(viewIndex > registryIndex);
    assert.ok(controllerIndex > viewIndex);
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
