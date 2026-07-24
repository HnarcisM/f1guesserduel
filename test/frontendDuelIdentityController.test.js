const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const controllerModulePromise = import('../public/js/duelIdentityController.js');

async function importController() {
    return controllerModulePromise;
}

function hasClass(element, className) {
    return String(element?.className || '').split(/\s+/).includes(className);
}

function createElement(tagName = 'div') {
    const element = {
        tagName: String(tagName).toUpperCase(),
        className: '',
        dataset: {},
        attributes: {},
        children: [],
        parentElement: null,
        textContent: '',
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        append(...children) {
            for (const child of children) {
                if (!child) continue;
                if (child.parentElement) {
                    child.parentElement.children = child.parentElement.children.filter(entry => entry !== child);
                }
                child.parentElement = this;
                this.children.push(child);
            }
        },
        insertBefore(child, reference) {
            if (child.parentElement) {
                child.parentElement.children = child.parentElement.children.filter(entry => entry !== child);
            }
            const index = this.children.indexOf(reference);
            child.parentElement = this;
            if (index === -1) this.children.push(child);
            else this.children.splice(index, 0, child);
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            if (!selector.startsWith('.')) return [];
            const className = selector.slice(1);
            const matches = [];
            function visit(node) {
                for (const child of node.children || []) {
                    if (hasClass(child, className)) matches.push(child);
                    visit(child);
                }
            }
            visit(this);
            return matches;
        }
    };
    return element;
}

function appendClass(parent, tag, className, text = '') {
    const child = createElement(tag);
    child.className = className;
    child.textContent = text;
    parent.append(child);
    return child;
}

function createLobbyCard(username) {
    const card = createElement('article');
    card.className = 'duel-lobby-member-card';
    appendClass(card, 'span', 'duel-lobby-member-label', 'Player 1');
    appendClass(card, 'strong', 'duel-lobby-member-name', username);
    appendClass(card, 'span', 'duel-lobby-member-status', 'În lobby');
    appendClass(card, 'div', 'duel-lobby-member-badges');
    return card;
}

function createScoreEntry(username) {
    const row = createElement('div');
    row.className = 'room-score-entry';
    appendClass(row, 'span', 'room-score-name', username);
    appendClass(row, 'span', 'room-score-wins', '0');
    return row;
}

function createLiveCard(username) {
    const card = createElement('article');
    card.className = 'live-player-card';
    const header = appendClass(card, 'div', 'live-player-header');
    const title = createElement('div');
    header.append(title);
    appendClass(title, 'p', 'live-player-label', 'Player 1');
    appendClass(title, 'h3', 'live-player-name', username);
    appendClass(header, 'span', 'live-player-status', 'În joc');
    appendClass(card, 'div', 'live-guess-list');
    return card;
}

function createDocumentStub() {
    const containers = new Map();
    function addContainer(id, children) {
        const container = createElement('div');
        container.id = id;
        container.append(...children);
        containers.set(id, container);
    }
    addContainer('duelLobbyMembers', [createLobbyCard('Narcis'), createLobbyCard('Rival')]);
    addContainer('duelLobbySpectators', [createLobbyCard('Guest 3')]);
    addContainer('roomScoreboardPlayers', [createScoreEntry('Narcis'), createScoreEntry('Rival')]);
    addContainer('liveDuelPlayers', [createLiveCard('Narcis'), createLiveCard('Rival')]);

    return {
        createElement,
        getElementById(id) {
            return containers.get(id) || null;
        }
    };
}

test('Duel identity normalization accepts only public avatar presets and safe levels', async () => {
    const { normalizeDuelIdentity } = await importController();

    assert.deepEqual(normalizeDuelIdentity({
        username: ' Narcis ',
        avatarKey: 'HELMET-BLUE',
        level: 7,
        email: 'private@example.com'
    }), {
        username: 'Narcis',
        avatarKey: 'helmet-blue',
        level: 7
    });
    assert.deepEqual(normalizeDuelIdentity({ avatarKey: '../../avatar.svg', level: -3 }), {
        username: 'Guest',
        avatarKey: 'helmet-red',
        level: 1
    });
});

test('controller decorates lobby, scoreboard and live board with avatar and level', async () => {
    const { createDuelIdentityController } = await importController();
    const document = createDocumentStub();
    const controller = createDuelIdentityController({ document, schedule: callback => callback() });
    const players = [
        { username: 'Narcis', avatarKey: 'helmet-blue', level: 5 },
        { username: 'Rival', avatarKey: 'helmet-green', level: 3 }
    ];

    const result = controller.render({
        roomState: {
            players,
            spectators: [{ username: 'Guest 3', avatarKey: 'helmet-red', level: 1 }],
            scoreboard: players.map((player, index) => ({ ...player, wins: index }))
        },
        liveBoard: { players }
    });

    assert.deepEqual(result, {
        lobbyPlayers: 2,
        lobbySpectators: 1,
        scoreboard: 2,
        liveBoard: 2
    });

    const lobbyCard = document.getElementById('duelLobbyMembers').children[0];
    assert.equal(lobbyCard.querySelector('.duel-identity-avatar').dataset.avatarKey, 'helmet-blue');
    assert.equal(lobbyCard.querySelector('.duel-identity-level').textContent, 'Nivel 5');
    assert.equal(lobbyCard.querySelector('.duel-lobby-member-name').textContent, 'Narcis');

    const scoreRow = document.getElementById('roomScoreboardPlayers').children[1];
    assert.equal(scoreRow.querySelector('.duel-identity-avatar').dataset.avatarKey, 'helmet-green');
    assert.equal(scoreRow.querySelector('.duel-identity-level').textContent, 'Nivel 3');

    const liveCard = document.getElementById('liveDuelPlayers').children[0];
    assert.equal(liveCard.querySelector('.duel-identity-avatar').dataset.avatarKey, 'helmet-blue');
    assert.equal(liveCard.querySelector('.duel-identity-level').textContent, 'Nivel 5');
});

test('socket updates refresh the rendered public identity after room state changes', async () => {
    const { createDuelIdentityController } = await importController();
    const document = createDocumentStub();
    const handlers = new Map();
    const socket = {
        on(eventName, handler) {
            handlers.set(eventName, handler);
        }
    };
    const controller = createDuelIdentityController({ document, schedule: callback => callback() });
    controller.attachSocket(socket);

    handlers.get('roomStateUpdate')({
        room: {
            players: [
                { username: 'Narcis', avatarKey: 'helmet-purple', level: 6 },
                { username: 'Rival', avatarKey: 'helmet-yellow', level: 2 }
            ],
            spectators: [],
            scoreboard: [
                { username: 'Narcis', avatarKey: 'helmet-purple', level: 6, wins: 1 },
                { username: 'Rival', avatarKey: 'helmet-yellow', level: 2, wins: 0 }
            ]
        }
    });

    const lobbyCard = document.getElementById('duelLobbyMembers').children[0];
    assert.equal(lobbyCard.querySelector('.duel-identity-avatar').dataset.avatarKey, 'helmet-purple');
    assert.equal(lobbyCard.querySelector('.duel-identity-level').textContent, 'Nivel 6');
});

test('HTML loads versioned Duel identity styles and controller after the main bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const bundleIndex = html.indexOf('/game.bundle.min.js?v=');
    const controllerIndex = html.indexOf('/js/duelIdentityController.js?v=');

    assert.match(html, /\/css\/20-duel-identity\.css\?v=[a-f0-9]{16}/);
    assert.ok(controllerIndex > bundleIndex);
    assert.match(html, /<script type="module" src="\/js\/duelIdentityController\.js\?v=[a-f0-9]{16}"><\/script>/);
});


test('identity decorators update existing nodes and reject incomplete DOM structures safely', async () => {
    const {
        decorateLobbyCard,
        decorateScoreEntry,
        decorateLivePlayerCard
    } = await importController();
    const document = { createElement };

    assert.equal(decorateLobbyCard(document, null, {}), false);
    assert.equal(decorateLobbyCard(document, createElement(), null), false);
    assert.equal(decorateLobbyCard(document, createElement(), { username: 'Missing' }), false);
    assert.equal(decorateScoreEntry(document, null, {}), false);
    assert.equal(decorateScoreEntry(document, createElement(), null), false);
    assert.equal(decorateScoreEntry(document, createElement(), { username: 'Missing' }), false);
    assert.equal(decorateLivePlayerCard(document, null, {}), false);
    assert.equal(decorateLivePlayerCard(document, createElement(), null), false);
    assert.equal(decorateLivePlayerCard(document, createElement(), { username: 'Missing' }), false);

    const detachedName = createElement('h3');
    detachedName.className = 'live-player-name';
    const incompleteLiveCard = createElement('article');
    const incompleteHeader = appendClass(incompleteLiveCard, 'div', 'live-player-header');
    incompleteLiveCard.querySelector = selector => {
        if (selector === '.live-player-header') return incompleteHeader;
        if (selector === '.live-player-name') return detachedName;
        return null;
    };
    assert.equal(decorateLivePlayerCard(document, incompleteLiveCard, { username: 'Missing parent' }), false);

    const lobby = createLobbyCard('Narcis');
    const score = createScoreEntry('Narcis');
    const live = createLiveCard('Narcis');
    assert.equal(decorateLobbyCard(document, lobby, { avatarKey: 'helmet-blue', level: 2 }), true);
    assert.equal(decorateScoreEntry(document, score, { avatarKey: 'helmet-blue', level: 2 }), true);
    assert.equal(decorateLivePlayerCard(document, live, { avatarKey: 'helmet-blue', level: 2 }), true);
    assert.equal(decorateLobbyCard(document, lobby, { avatarKey: 'helmet-orange', level: 8 }), true);
    assert.equal(decorateScoreEntry(document, score, { avatarKey: 'helmet-orange', level: 8 }), true);
    assert.equal(decorateLivePlayerCard(document, live, { avatarKey: 'helmet-orange', level: 8 }), true);

    for (const surface of [lobby, score, live]) {
        assert.equal(surface.querySelector('.duel-identity-avatar').dataset.avatarKey, 'helmet-orange');
        assert.equal(surface.querySelector('.duel-identity-level').textContent, 'Nivel 8');
    }
});

test('controller tolerates absent collections and coalesces scheduled renders', async () => {
    const { createDuelIdentityController } = await importController();
    const callbacks = [];
    const emptyDocument = {
        createElement,
        getElementById() { return null; }
    };
    const controller = createDuelIdentityController({
        document: emptyDocument,
        schedule(callback) { callbacks.push(callback); }
    });

    assert.deepEqual(controller.render(), {
        lobbyPlayers: 0,
        lobbySpectators: 0,
        scoreboard: 0,
        liveBoard: 0
    });
    controller.scheduleRender({ roomState: { players: 'invalid', spectators: null, scoreboard: [] } });
    controller.scheduleRender({ liveBoard: { players: [] }, scoreboard: [] });
    assert.equal(callbacks.length, 1);
    callbacks.shift()();
    assert.equal(controller.getLatestRoomState().players, 'invalid');
    assert.throws(() => createDuelIdentityController(), /requires a document/);
});

test('controller handles every Duel socket event and ignores invalid or duplicate sockets', async () => {
    const { createDuelIdentityController } = await importController();
    const document = createDocumentStub();
    const handlers = new Map();
    const socket = {
        on(eventName, handler) { handlers.set(eventName, handler); }
    };
    const controller = createDuelIdentityController({ document, schedule: callback => callback() });

    controller.attachSocket(null);
    controller.attachSocket({});
    controller.attachSocket(socket);
    controller.attachSocket(socket);
    assert.deepEqual([...handlers.keys()].sort(), [
        'duelAborted',
        'initGame',
        'roomStateUpdate',
        'roundResolved'
    ]);

    const players = [
        { username: 'Narcis', avatarKey: 'helmet-cyan', level: 9 },
        { username: 'Rival', avatarKey: 'helmet-white', level: 4 }
    ];
    handlers.get('roomStateUpdate')({ players, spectators: [], scoreboard: players });
    handlers.get('roundResolved')({ scoreboard: players, liveBoard: { players } });
    handlers.get('duelAborted')({ room: { players, spectators: [], scoreboard: players }, liveBoard: { players } });
    handlers.get('initGame')({ liveBoard: { players, scoreboard: players } });

    assert.equal(document.getElementById('liveDuelPlayers').children[0]
        .querySelector('.duel-identity-level').textContent, 'Nivel 9');
});

test('install attaches current and future sockets with microtask and promise scheduling', async () => {
    const { install } = await importController();
    const currentHandlers = new Map();
    const futureHandlers = new Map();
    const listeners = new Map();
    const currentSocket = { on(name, handler) { currentHandlers.set(name, handler); } };
    const futureSocket = { on(name, handler) { futureHandlers.set(name, handler); } };
    const windowWithMicrotask = {
        document: createDocumentStub(),
        __f1GameSocket: currentSocket,
        queueMicrotask(callback) { callback(); },
        addEventListener(name, handler) { listeners.set(name, handler); }
    };

    const installed = install(windowWithMicrotask);
    assert.equal(windowWithMicrotask.__f1DuelIdentityController, installed);
    assert.equal(currentHandlers.has('roomStateUpdate'), true);
    listeners.get('f1:socket-created')({ detail: { socket: futureSocket } });
    assert.equal(futureHandlers.has('roundResolved'), true);
    listeners.get('f1:socket-created')({});

    const promiseListeners = new Map();
    const windowWithPromise = {
        document: createDocumentStub(),
        addEventListener(name, handler) { promiseListeners.set(name, handler); }
    };
    const promiseController = install(windowWithPromise);
    promiseController.scheduleRender({ roomState: { players: [], spectators: [], scoreboard: [] } });
    await Promise.resolve();
    assert.equal(promiseListeners.has('f1:socket-created'), true);
});
