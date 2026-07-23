const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function importDuelSeriesController() {
    return import(`../public/js/duelSeriesController.js?seriesControllerTest=${Date.now()}-${Math.random()}`);
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

function createElement({ bestOf = null } = {}) {
    const listeners = new Map();
    return {
        dataset: bestOf === null ? {} : { duelBestOf: String(bestOf) },
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
            return listeners.get('click')?.({ target: this });
        },
        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        }
    };
}

function createDocumentStub() {
    const formatButtons = [3, 5, 7].map(bestOf => createElement({ bestOf }));
    const scoreboardLabel = createElement();
    const elements = new Map([
        ['duelSeriesSummary', createElement()],
        ['duelSeriesTitle', createElement()],
        ['duelSeriesStatus', createElement()],
        ['duelSeriesFormatHint', createElement()],
        ['duelSeriesResetBtn', createElement()],
        ['duelLobbyStartBtn', createElement()],
        ['duelLobbyReadyBtn', createElement()],
        ['duelLobbyReadyHint', createElement()],
        ['endGameTitle', createElement()],
        ['endGameMessage', createElement()],
        ['restartGameBtn', createElement()]
    ]);

    return {
        elements,
        formatButtons,
        scoreboardLabel,
        getElementById(id) {
            return elements.get(id) || null;
        },
        querySelector(selector) {
            return selector === '#roomScoreboard .room-scoreboard-label'
                ? scoreboardLabel
                : null;
        },
        querySelectorAll(selector) {
            return selector === '[data-duel-best-of]' ? formatButtons : [];
        }
    };
}

function createRoomState({
    bestOf = 3,
    status = 'waiting',
    roundsPlayed = 0,
    draws = 0,
    winnerUsername = null,
    isHost = true,
    role = 'player',
    roundState = 'waiting',
    scoreboard = [
        { username: 'Host', wins: 0 },
        { username: 'Guest', wins: 0 }
    ]
} = {}) {
    return {
        roomId: 'SERIES1',
        roundState,
        difficulty: 'medium',
        timeLimitSeconds: 90,
        lobbySettings: {
            difficulty: 'medium',
            timed: true,
            timeLimitSeconds: 90,
            bestOf
        },
        scoreboard,
        match: {
            bestOf,
            winsRequired: Math.floor(bestOf / 2) + 1,
            status,
            roundsPlayed,
            draws,
            winnerUsername
        },
        you: { isHost, role }
    };
}

function createSocketStub() {
    const handlers = new Map();
    const emitted = [];
    return {
        handlers,
        emitted,
        on(name, handler) {
            handlers.set(name, handler);
        },
        emit(name, payload) {
            emitted.push([name, payload]);
        },
        trigger(name, payload) {
            return handlers.get(name)?.(payload);
        }
    };
}

test('Best of view derives target wins and active score progress', async () => {
    const { getSeriesViewState, buildSeriesStatus } = await importDuelSeriesController();
    const viewState = getSeriesViewState(createRoomState({
        bestOf: 5,
        status: 'active',
        roundsPlayed: 3,
        draws: 1,
        scoreboard: [
            { username: 'Host', wins: 2 },
            { username: 'Guest', wins: 0 }
        ]
    }));

    assert.equal(viewState.bestOf, 5);
    assert.equal(viewState.winsRequired, 3);
    assert.equal(viewState.canConfigure, true);
    assert.match(buildSeriesStatus(viewState), /Host 2 - 0 Guest/);
    assert.match(buildSeriesStatus(viewState), /3 runde jucate/);
    assert.match(buildSeriesStatus(viewState), /1 remiză/);
});

test('host changing an active series confirms and preserves the other lobby settings', async () => {
    const { createDuelSeriesController } = await importDuelSeriesController();
    const document = createDocumentStub();
    const confirmations = [];
    const socket = createSocketStub();
    const controller = createDuelSeriesController({
        document,
        confirm(message) {
            confirmations.push(message);
            return true;
        },
        schedule: callback => callback()
    });

    controller.setup();
    controller.attachSocket(socket);
    controller.render(createRoomState({ bestOf: 3, status: 'active', roundsPlayed: 1 }));
    document.formatButtons.find(button => button.dataset.duelBestOf === '5').click();

    assert.equal(confirmations.length, 1);
    assert.match(confirmations[0], /reseta scorul/i);
    assert.deepEqual(socket.emitted, [[
        'updateDuelLobbySettings',
        { level: 'medium', timed: true, timeLimitSeconds: 90, bestOf: 5 }
    ]]);
});

test('finished series locks round controls and lets only the host start a new match', async () => {
    const { createDuelSeriesController } = await importDuelSeriesController();
    const document = createDocumentStub();
    const socket = createSocketStub();
    const controller = createDuelSeriesController({ document, schedule: callback => callback() });

    controller.setup();
    controller.attachSocket(socket);
    controller.render(createRoomState({
        bestOf: 7,
        status: 'finished',
        roundsPlayed: 6,
        winnerUsername: 'Host',
        scoreboard: [
            { username: 'Host', wins: 4 },
            { username: 'Guest', wins: 2 }
        ]
    }));

    assert.equal(document.getElementById('duelLobbyStartBtn').disabled, true);
    assert.equal(document.getElementById('duelLobbyReadyBtn').disabled, true);
    assert.equal(document.getElementById('duelSeriesResetBtn').hidden, false);
    assert.equal(document.getElementById('duelSeriesResetBtn').disabled, false);
    assert.match(document.getElementById('duelSeriesStatus').textContent, /Host a câștigat/);
    assert.equal(document.scoreboardLabel.textContent, 'Scor meci · Best of 7');

    document.getElementById('duelSeriesResetBtn').click();
    assert.deepEqual(socket.emitted, [['resetDuelMatch', undefined]]);
});

test('non-host sees a finished series but cannot reset it', async () => {
    const { createDuelSeriesController } = await importDuelSeriesController();
    const document = createDocumentStub();
    const socket = createSocketStub();
    const controller = createDuelSeriesController({ document, schedule: callback => callback() });

    controller.setup();
    controller.attachSocket(socket);
    controller.render(createRoomState({ status: 'finished', isHost: false }));

    const resetButton = document.getElementById('duelSeriesResetBtn');
    assert.equal(resetButton.hidden, false);
    assert.equal(resetButton.disabled, true);
    resetButton.click();
    assert.deepEqual(socket.emitted, []);
});

test('final match result customizes the end-of-round popup', async () => {
    const { createDuelSeriesController } = await importDuelSeriesController();
    const document = createDocumentStub();
    const controller = createDuelSeriesController({ document, schedule: callback => callback() });

    controller.customizeMatchResult({
        match: { status: 'finished', bestOf: 5, winnerUsername: 'Host' },
        scoreboard: [
            { username: 'Host', wins: 3 },
            { username: 'Guest', wins: 1 }
        ],
        resultForYou: { outcome: 'win' }
    });

    assert.equal(document.getElementById('endGameTitle').textContent, '🏆 AI CÂȘTIGAT MECIUL!');
    assert.match(document.getElementById('endGameMessage').textContent, /Best of 5/);
    assert.match(document.getElementById('endGameMessage').textContent, /Host 3 - 1 Guest/);
    assert.equal(document.getElementById('restartGameBtn').textContent, '🏁 Revino în lobby');
});

test('HTML loads the Best of controls and versioned controller after the main bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const bundleIndex = html.indexOf('/game.bundle.min.js?v=');
    const controllerIndex = html.indexOf('/js/duelSeriesController.js?v=');

    assert.match(html, /data-duel-best-of="3"/);
    assert.match(html, /data-duel-best-of="5"/);
    assert.match(html, /data-duel-best-of="7"/);
    assert.match(html, /id="duelSeriesResetBtn"/);
    assert.match(html, /\/css\/17-duel-series\.css\?v=[a-f0-9]{16}/);
    assert.ok(controllerIndex > bundleIndex);
    assert.match(html, /<script type="module" src="\/js\/duelSeriesController\.js\?v=[a-f0-9]{16}"><\/script>/);
});
