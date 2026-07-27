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
        createElementNS(_namespace, tagName) { return createFakeElement(tagName); },
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
        variants.map(variant => variant.iconKey),
        ['racing-line', 'race-day', 'duel-helmets', 'boost-clock', 'heritage-helmet', 'hot-streak', 'grand-prix-week', 'constructor-works', 'driver-grid', 'circuit-flag']
    );
    assert.equal(variants.every(variant => typeof variant.iconKey === 'string' && !Object.hasOwn(variant, 'icon')), true);
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
        ['gameHubProfileVictories', 'gameHubProfileAccuracy', 'gameHubProfileActiveDays', 'gameHubProfilePlayed']
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
    assert.equal(elements.find(element => element.id === 'gameHubDuelActiveRooms')?.textContent, '0');
    assert.equal(elements.find(element => element.id === 'gameHubDuelActiveMatches')?.textContent, '0');
    assert.equal(elements.find(element => element.id === 'gameHubDuelParticipants')?.textContent, '0');
    assert.equal(elements.find(element => element.id === 'gameHubDuelRoomListTitle')?.textContent, 'Camere active (0)');
    assert.equal(
        elements.find(element => element.id === 'gameHubDuelRoomItems')?.children[0]?.textContent,
        ''
    );

    const svgIcons = elements.filter(element => element.tagName === 'SVG' && element.dataset?.iconKey);
    assert.equal(svgIcons.length, 17, '9 carduri standard + 3 titluri de panou + 4 statistici + săgeata CTA');
    assert.deepEqual(
        cards.filter(card => !card.classList.contains('game-hub-featured-card'))
            .map(card => flatten(card).find(element => element.classList?.contains('mode-icon'))?.dataset.iconKey),
        ['racing-line', 'race-day', 'heritage-helmet', 'grand-prix-week', 'boost-clock', 'hot-streak', 'constructor-works', 'driver-grid', 'circuit-flag']
    );
    assert.deepEqual(
        elements.filter(element => element.classList?.contains('game-hub-panel-icon'))
            .map(element => element.dataset.iconKey),
        ['trophy', 'duel-helmets', 'sparkles']
    );
    assert.equal(
        elements.some(element => element.classList?.contains('game-hub-panel-badge')),
        false,
        'iconurile din titluri nu folosesc chenare de tip badge'
    );
    assert.deepEqual(
        elements.filter(element => element.classList?.contains('game-hub-summary-svg'))
            .map(element => element.dataset.iconKey),
        ['trophy', 'target', 'calendar', 'grid']
    );
    assert.equal(
        elements.find(element => element.classList?.contains('game-hub-featured-cta-icon'))?.dataset.iconKey,
        'arrow-right'
    );
    assert.equal(svgIcons.every(icon => icon.getAttribute('aria-hidden') === 'true'), true);
    assert.equal(svgIcons.every(icon => icon.getAttribute('focusable') === 'false'), true);
    assert.equal(svgIcons.some(icon => icon.dataset.iconFallback === 'true'), false);
});


test('premium Constructor icon uses a works-team badge with layered racing details', async () => {
    const { dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const icon = dashboardView.createGameHubIcon(documentObject, 'constructor-works');
    const elements = flatten(icon);

    assert.equal(icon.dataset.iconKey, 'constructor-works');
    assert.equal(icon.dataset.iconFallback, undefined);
    assert.ok(icon.children.length >= 5);
    assert.ok(elements.some(element => element.getAttribute?.('class') === 'icon-strong'));
    assert.ok(elements.some(element => element.getAttribute?.('class') === 'icon-secondary'));
    assert.ok(elements.some(element => element.getAttribute?.('class') === 'icon-accent'));
    assert.ok(elements.some(element => element.getAttribute?.('class') === 'icon-soft-fill'));
});


test('SVG icon factory uses a safe static fallback without innerHTML', async () => {
    const { dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    const icon = dashboardView.createGameHubIcon(documentObject, '<script>alert(1)</script>');

    assert.equal(icon.tagName, 'SVG');
    assert.equal(icon.dataset.iconKey, 'sparkles');
    assert.equal(icon.dataset.iconFallback, 'true');
    assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.ok(icon.children.length > 0);
    assert.equal(flatten(icon).some(element => /script/i.test(element.tagName)), false);

    const intentionalSparkles = dashboardView.createGameHubIcon(documentObject, 'sparkles');
    assert.equal(intentionalSparkles.dataset.iconKey, 'sparkles');
    assert.equal(intentionalSparkles.dataset.iconFallback, undefined);
});


test('Duel card renders live room metrics and a safe three-room preview', async () => {
    const { registry, createGameHubController, dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    createGameHubController({ documentObject, registry }).render();

    const result = dashboardView.renderDuelRoomSnapshot(documentObject, {
        totalRooms: 4,
        generatedAt: Date.now(),
        rooms: [
            {
                roomId: 'LIVE123',
                hostUsername: '<Host Live>',
                players: [
                    { username: '<Host Live>', avatarKey: 'helmet-blue', isHost: true, connected: true },
                    { username: 'Rival', avatarKey: 'helmet-purple', isHost: false, connected: true }
                ],
                playerCount: 2,
                spectatorCount: 3,
                totalCount: 5,
                maxPlayers: 2,
                roundState: 'playing',
                canJoinAsPlayer: false,
                lobbySettings: { difficulty: 'hard', timed: true, timeLimitSeconds: 90 }
            },
            {
                roomId: 'OPEN456',
                hostUsername: 'Narcis',
                players: [
                    { username: 'Narcis', avatarKey: 'not-an-avatar', isHost: true, connected: true }
                ],
                playerCount: 1,
                spectatorCount: 0,
                maxPlayers: 2,
                roundState: 'waiting',
                canJoinAsPlayer: true,
                lobbySettings: { difficulty: 'medium', timed: false }
            },
            {
                roomId: 'FULL789',
                hostUsername: 'Mihai',
                playerCount: 2,
                spectatorCount: 1,
                maxPlayers: 2,
                roundState: 'waiting',
                canJoinAsPlayer: false,
                lobbySettings: { difficulty: 'easy', timed: false }
            },
            {
                roomId: 'LAST000',
                hostUsername: 'Alex',
                playerCount: 1,
                spectatorCount: 0,
                maxPlayers: 2,
                roundState: 'finished',
                canJoinAsPlayer: true,
                lobbySettings: { difficulty: 'easy', timed: true, timeLimitSeconds: 60 }
            }
        ]
    });

    assert.equal(result.totalRooms, 4);
    assert.equal(result.activeMatches, 1);
    assert.equal(result.participants, 10);
    assert.equal(documentObject.getElementById('gameHubDuelActiveRooms').textContent, '4');
    assert.equal(documentObject.getElementById('gameHubDuelActiveMatches').textContent, '1');
    assert.equal(documentObject.getElementById('gameHubDuelParticipants').textContent, '10');
    assert.equal(documentObject.getElementById('gameHubDuelRoomListTitle').textContent, 'Camere active (4)');

    const previewItems = documentObject.getElementById('gameHubDuelRoomItems').children;
    assert.equal(previewItems.length, 4, 'trei camere și indicatorul pentru camera rămasă');
    assert.equal(previewItems[0].dataset.roomId, 'LIVE123');
    assert.equal(previewItems[0].querySelector('.game-hub-duel-room-title').textContent, 'Camera LIVE123');
    assert.deepEqual(
        previewItems[0].querySelectorAll('.game-hub-duel-player-name').map(element => element.textContent),
        ['<Host Live>', 'Rival']
    );
    assert.deepEqual(
        previewItems[0].querySelectorAll('.game-hub-duel-player-avatar').map(element => element.dataset.avatarKey),
        ['helmet-blue', 'helmet-purple']
    );
    assert.equal(previewItems[0].querySelector('.game-hub-duel-room-live').textContent, 'Live');
    assert.deepEqual(
        previewItems[1].querySelectorAll('.game-hub-duel-player-name').map(element => element.textContent),
        ['Narcis', 'Loc liber']
    );
    assert.equal(
        previewItems[1].querySelectorAll('.game-hub-duel-player-avatar')[0].dataset.avatarKey,
        'helmet-red',
        'avatarurile necunoscute folosesc presetul public implicit'
    );
    assert.equal(previewItems[1].querySelector('.game-hub-duel-room-live').textContent, 'Lobby');
    assert.equal(previewItems[2].querySelector('.game-hub-duel-room-live').textContent, 'Plină');
    assert.match(previewItems[3].querySelector('.game-hub-duel-room-title').textContent, /^\+1 cameră disponibilă$/);
    assert.equal(documentObject.getElementById('gameHubDuelCard').classList.contains('has-live-rooms'), true);
});

test('Duel room sync requests the initial list, consumes roomListUpdate and cleans listeners', async () => {
    const { registry, createGameHubController, dashboardView } = await loadGameHubModules();
    const documentObject = createFakeDocument();
    createGameHubController({
        documentObject,
        registry,
        windowObject: {}
    }).render();

    const windowListeners = new Map();
    const socketListeners = new Map();
    const emitted = [];
    const windowObject = {
        addEventListener(eventName, handler) {
            windowListeners.set(eventName, handler);
        },
        removeEventListener(eventName, handler) {
            if (windowListeners.get(eventName) === handler) windowListeners.delete(eventName);
        }
    };
    const socket = {
        emit(eventName, payload) {
            emitted.push({ eventName, payload });
        },
        on(eventName, handler) {
            socketListeners.set(eventName, handler);
        },
        off(eventName, handler) {
            if (socketListeners.get(eventName) === handler) socketListeners.delete(eventName);
        }
    };

    const sync = dashboardView.installGameHubDuelRoomSync({
        documentObject,
        windowObject,
        socket
    });

    assert.equal(emitted[0]?.eventName, 'requestRoomList');
    assert.equal(typeof socketListeners.get('roomListUpdate'), 'function');
    socketListeners.get('roomListUpdate')({
        totalRooms: 1,
        rooms: [{
            roomId: 'SYNC123',
            hostUsername: 'Narcis',
            players: [{
                username: 'Narcis',
                avatarKey: 'helmet-yellow',
                isHost: true,
                connected: true
            }],
            playerCount: 1,
            spectatorCount: 0,
            maxPlayers: 2,
            roundState: 'waiting',
            canJoinAsPlayer: true
        }]
    });

    assert.equal(documentObject.getElementById('gameHubDuelActiveRooms').textContent, '1');
    assert.equal(documentObject.getElementById('gameHubDuelRoomItems').children[0].dataset.roomId, 'SYNC123');
    assert.equal(
        documentObject.getElementById('gameHubDuelRoomItems').children[0]
            .querySelector('.game-hub-duel-player-avatar').dataset.avatarKey,
        'helmet-yellow'
    );

    socketListeners.get('disconnect')?.();
    assert.equal(documentObject.getElementById('gameHubDuelCard').classList.contains('is-room-list-offline'), true);
    assert.match(documentObject.getElementById('gameHubDuelRoomStatus').textContent, /Conexiunea a fost întreruptă/);

    sync.disconnect();
    assert.equal(windowListeners.has('f1:socket-created'), false);
    assert.equal(socketListeners.has('roomListUpdate'), false);
    assert.equal(socketListeners.has('connect'), false);
    assert.equal(socketListeners.has('disconnect'), false);
    assert.equal(socketListeners.has('connect_error'), false);
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
            totals: { played: 34, won: 21, winRate: 62, accuracy: 62, activeDays: 12 },
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
    assert.equal(documentObject.getElementById('gameHubProfileAccuracy').textContent, '62%');
    assert.equal(documentObject.getElementById('gameHubProfileActiveDays').textContent, '12');
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
                stats: { totals: { played: 5, won: 3, winRate: 60, accuracy: 60, activeDays: 2 }, modes: {} },
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
                totals: { played: 6, won: 4, winRate: 67, accuracy: 67, activeDays: 3 },
                modes: { single: { currentStreak: 3 } }
            },
            progress: { level: 2, xpIntoLevel: 180, xpForLevel: 300, progressPercent: 60 }
        });
        assert.equal(documentObject.getElementById('gameHubProfileVictories').textContent, '4');
        assert.equal(documentObject.getElementById('gameHubProfilePlayed').textContent, '6');
        assert.equal(documentObject.getElementById('gameHubProfileAccuracy').textContent, '67%');
        assert.equal(documentObject.getElementById('gameHubProfileActiveDays').textContent, '3');
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

test('Game Hub keeps profile and settings on the right while the title stays centered', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'),
        'utf8'
    );

    assert.match(
        css,
        /body:has\(#difficulty-overlay:not\(\.hidden\)\) \.header-actions\s*\{[^}]*margin-left:\s*auto;/s
    );
    assert.match(
        css,
        /@media \(max-width:\s*920px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/
    );
    assert.match(
        css,
        /body:has\(#difficulty-overlay:not\(\.hidden\)\) \.site-header h1\s*\{[^}]*grid-column:\s*2;[^}]*justify-self:\s*center;/s
    );
    assert.match(
        css,
        /body:has\(#difficulty-overlay:not\(\.hidden\)\) \.header-actions\s*\{[^}]*grid-column:\s*3;[^}]*justify-self:\s*end;/s
    );
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

test('Track Guesser wide card stretches artwork, copy and background across its border', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'),
        'utf8'
    );

    assert.match(css, /GAME_HUB_TRACK_FULL_WIDTH_FIX_START/);
    assert.match(
        css,
        /\.game-hub-card-grid--specialty \.game-hub-card\.game-mode-card\.game-hub-card--track\s*\{[^}]*align-items:\s*stretch;/s
    );
    assert.match(
        css,
        /\.game-hub-card\.game-mode-card\.game-hub-card--track \.game-hub-card-chrome\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*align-self:\s*stretch;/s
    );
    assert.match(
        css,
        /\.game-hub-card\.game-mode-card\.game-hub-card--track \.game-hub-card-art,\s*\.game-hub-card\.game-mode-card\.game-hub-card--track \.game-hub-card-content\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s
    );
});

test('Game Hub SVG polish keeps semantic icon keys, theme colors and reduced-motion support', () => {
    const registrySource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'gameVariantRegistry.js'), 'utf8');
    const viewSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'gameHubDashboardView.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'), 'utf8');

    assert.doesNotMatch(registrySource, /🎯|🌅|⚔️|⏱️|🏛️|🔥|📅|🏎️|🧩|🗺️/);
    assert.match(registrySource, /iconKey:\s*'racing-line'/);
    assert.match(viewSource, /createElementNS\(SVG_NAMESPACE, tagName\)/);
    assert.doesNotMatch(viewSource, /innerHTML\s*=/);
    assert.match(css, /GAME_HUB_SVG_ICON_POLISH_START/);
    assert.match(css, /\.game-hub-svg-icon\s*\{[\s\S]*?color:\s*inherit;/);
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test('Game Hub category headers keep unframed icons left of titles and centered accent bars', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'),
        'utf8'
    );
    const dashboardSource = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'gameHubDashboardView.js'),
        'utf8'
    );

    assert.match(source, /\.game-hub-panel-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(source, /\.game-hub-panel-header\s*\{[\s\S]*?justify-items:\s*center/);
    assert.match(source, /\.game-hub-panel-heading\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center/);
    assert.match(source, /\.game-hub-panel-icon\s*\{[\s\S]*?width:\s*23px[\s\S]*?height:\s*23px/);
    assert.doesNotMatch(source, /\.game-hub-panel-icon\s*\{[^}]*?(?:border|background)\s*:/);
    assert.match(dashboardSource, /heading\.append\([\s\S]*?createGameHubIcon\(documentObject,\s*iconKey,\s*'game-hub-panel-icon game-hub-svg-icon'\)[\s\S]*?copy/);
    assert.doesNotMatch(dashboardSource, /game-hub-panel-badge/);
    assert.match(source, /\.game-hub-panel-copy\s*\{[\s\S]*?text-align:\s*left/);
    assert.match(source, /\.game-hub-panel-accent\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?justify-self:\s*center/);
    assert.match(source, /rgba\(0,\s*238,\s*255,\s*0\.96\)\s*50%/);
    assert.match(source, /rgba\(255,\s*67,\s*67,\s*0\.98\)\s*50%/);
    assert.match(source, /rgba\(255,\s*198,\s*41,\s*0\.97\)\s*50%/);
});

test('all standard Game Hub cards stretch artwork and copy across mobile width', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'),
        'utf8'
    );

    assert.match(css, /GAME_HUB_MOBILE_CARD_FULL_WIDTH_FIX_START/);
    const mobileBlock = css.match(
        /@media \(max-width:\s*520px\)\s*\{[\s\S]*?GAME_HUB_MOBILE_CARD_FULL_WIDTH_FIX_END/
    );
    assert.ok(mobileBlock, 'Lipsește fixul responsive comun pentru cardurile Game Hub');
    assert.match(
        mobileBlock[0],
        /\.game-hub-card-grid--single \.game-hub-card\.game-mode-card,\s*\.game-hub-card-grid--specialty \.game-hub-card\.game-mode-card\s*\{[^}]*align-items:\s*stretch;/s
    );
    assert.match(
        mobileBlock[0],
        /\.game-hub-card\.game-mode-card:not\(\.game-hub-featured-card\) \.game-hub-card-chrome\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*align-self:\s*stretch;/s
    );
    assert.match(
        mobileBlock[0],
        /\.game-hub-card\.game-mode-card:not\(\.game-hub-featured-card\) \.game-hub-card-art,\s*\.game-hub-card\.game-mode-card:not\(\.game-hub-featured-card\) \.game-hub-card-content\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*align-self:\s*stretch;/s
    );
});
