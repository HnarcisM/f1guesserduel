const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function importDuelReadyController() {
    return import(`../public/js/duelReadyController.js?readyControllerTest=${Date.now()}-${Math.random()}`);
}

function createRoomState({ hostReady = false, guestReady = false, you = 'host', roundState = 'waiting', matchStatus = 'active' } = {}) {
    const players = [
        {
            username: 'Host',
            role: 'player',
            connected: true,
            ready: hostReady,
            isHost: true,
            isYou: you === 'host'
        },
        {
            username: 'Guest',
            role: 'player',
            connected: true,
            ready: guestReady,
            isHost: false,
            isYou: you === 'guest'
        }
    ];
    const current = players.find(player => player.isYou);
    return {
        roomId: 'READY1',
        roundState,
        match: { status: matchStatus },
        players,
        you: current || { role: 'spectator', isHost: false }
    };
}

function createClassList() {
    const values = new Set();
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name),
        toggle(name, force) {
            const enabled = force === undefined ? !values.has(name) : Boolean(force);
            if (enabled) values.add(name);
            else values.delete(name);
            return enabled;
        }
    };
}

function createElement() {
    const listeners = new Map();
    return {
        children: [],
        classList: createClassList(),
        disabled: false,
        hidden: false,
        textContent: '',
        title: '',
        attributes: new Map(),
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        click() {
            listeners.get('click')?.({ target: this });
        },
        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
}

function createDocumentStub() {
    const elements = new Map([
        ['duelLobbyReadyBtn', createElement()],
        ['duelLobbyReadyHint', createElement()],
        ['duelLobbyStartBtn', createElement()],
        ['duelLobbyMembers', createElement()],
        ['duelLobbyPanel', createElement()],
        ['closeEndGamePopup', createElement()],
        ['endGameDisplay', createElement()],
        ['endGameBackdrop', createElement()],
        ['gameZone', createElement()],
        ['sendGuessBtn', createElement()],
        ['status', createElement()]
    ]);
    return {
        elements,
        addEventListener() {},
        createElement,
        getElementById(id) {
            return elements.get(id) || null;
        }
    };
}

test('Ready view allows only a ready host to start after both players confirm', async () => {
    const { getReadyViewState } = await importDuelReadyController();
    const pending = getReadyViewState(createRoomState({ hostReady: true, guestReady: false }));
    assert.equal(pending.currentReady, true);
    assert.equal(pending.allReady, false);
    assert.equal(pending.canStart, false);

    const confirmed = getReadyViewState(createRoomState({ hostReady: true, guestReady: true }));
    assert.equal(confirmed.allReady, true);
    assert.equal(confirmed.canStart, true);
});

test('Guest can toggle Ready but cannot start the Duel round', async () => {
    const { getReadyViewState } = await importDuelReadyController();
    const state = getReadyViewState(createRoomState({
        hostReady: true,
        guestReady: false,
        you: 'guest'
    }));

    assert.equal(state.canReady, true);
    assert.equal(state.canStart, false);
    assert.equal(state.currentReady, false);
});

test('Ready controller emits only the current player Ready toggle', async () => {
    const { createController } = await importDuelReadyController();
    const document = createDocumentStub();
    const controller = createController({ document, schedule: callback => callback() });
    const emitted = [];
    controller.attachSocket({
        on() {},
        emit(eventName, payload) {
            emitted.push([eventName, payload]);
        }
    });
    controller.setup();
    controller.render(createRoomState({ hostReady: false, guestReady: true }));

    document.getElementById('duelLobbyReadyBtn').click();
    assert.deepEqual(emitted, [['setDuelReady', { ready: true }]]);
});


test('Duel rematch returns to the Ready lobby without sending the old restart action', async () => {
    const { createController } = await importDuelReadyController();
    const document = createDocumentStub();
    const controller = createController({ document, schedule: callback => callback() });
    const closeButton = document.getElementById('closeEndGamePopup');
    const gameZone = document.getElementById('gameZone');
    const sendButton = document.getElementById('sendGuessBtn');
    const emitted = [];
    let closeCount = 0;

    controller.attachSocket({
        on() {},
        emit(eventName, payload) {
            emitted.push([eventName, payload]);
        }
    });

    closeButton.addEventListener('click', () => {
        closeCount += 1;
        gameZone.classList.remove('game-zone-hidden');
        gameZone.classList.add('game-zone-rematch');
        sendButton.classList.add('rematch-submit-btn');
        sendButton.disabled = false;
    });
    controller.render(createRoomState({ hostReady: false, guestReady: false, roundState: 'finished' }));

    let prevented = false;
    let stopped = false;
    controller.handleCaptureClick({
        target: {
            closest(selector) {
                return selector.includes('#restartGameBtn') ? this : null;
            }
        },
        preventDefault() {
            prevented = true;
        },
        stopImmediatePropagation() {
            stopped = true;
        }
    });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(closeCount, 1);
    assert.equal(gameZone.classList.contains('game-zone-hidden'), true);
    assert.equal(gameZone.classList.contains('game-zone-rematch'), false);
    assert.equal(sendButton.classList.contains('rematch-submit-btn'), false);
    assert.equal(sendButton.disabled, true);
    assert.match(document.getElementById('status').textContent, /Ready/);
    assert.deepEqual(emitted, [['setDuelReady', { ready: true }]]);
});

test('Closing the Duel result without choosing rematch does not auto-ready the player', async () => {
    const { createController } = await importDuelReadyController();
    const document = createDocumentStub();
    const controller = createController({ document, schedule: callback => callback() });
    const emitted = [];

    controller.attachSocket({
        on() {},
        emit(eventName, payload) {
            emitted.push([eventName, payload]);
        }
    });
    controller.render(createRoomState({ roundState: 'finished' }));
    controller.handleCaptureClick({
        target: {
            closest(selector) {
                return selector.includes('#closeEndGamePopup') ? this : null;
            }
        },
        preventDefault() {},
        stopImmediatePropagation() {}
    });

    assert.deepEqual(emitted, []);
});

test('Rematch does not auto-ready after the Best of match is already finished', async () => {
    const { createController } = await importDuelReadyController();
    const document = createDocumentStub();
    const controller = createController({ document, schedule: callback => callback() });
    const emitted = [];

    controller.attachSocket({
        on() {},
        emit(eventName, payload) {
            emitted.push([eventName, payload]);
        }
    });
    controller.render(createRoomState({ roundState: 'finished', matchStatus: 'finished' }));
    controller.handleCaptureClick({
        target: {
            closest(selector) {
                return selector.includes('#restartGameBtn') ? this : null;
            }
        },
        preventDefault() {},
        stopImmediatePropagation() {}
    });

    assert.deepEqual(emitted, []);
});

test('HTML loads the Ready panel and bridge around the unchanged main bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const bridgeIndex = html.indexOf('/js/socketBridgeBootstrap.js?v=');
    const bundleIndex = html.indexOf('/game.bundle.min.js?v=');
    const controllerIndex = html.indexOf('/js/duelReadyController.js?v=');

    assert.match(html, /id="duelLobbyReadyBtn"/);
    assert.match(html, /\/css\/16-duel-ready\.css\?v=[a-f0-9]{16}/);
    assert.ok(bridgeIndex >= 0 && bridgeIndex < bundleIndex);
    assert.ok(controllerIndex > bundleIndex);
    assert.match(html, /<script type="module" src="\/js\/duelReadyController\.js\?v=[a-f0-9]{16}"><\/script>/);
});
