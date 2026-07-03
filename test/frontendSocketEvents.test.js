const test = require('node:test');
const assert = require('node:assert/strict');

function createSocketStub() {
    const handlers = new Map();
    return {
        off() {},
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        emitEvent(eventName, payload) {
            const handler = handlers.get(eventName);
            assert.equal(typeof handler, 'function', `Expected handler for ${eventName}`);
            handler(payload);
        }
    };
}

function setupDocumentStub() {
    const elements = new Map();

    function makeElement() {
        return {
            classList: {
                classes: new Set(),
                add(name) { this.classes.add(name); },
                remove(name) { this.classes.delete(name); },
                toggle(name, force) {
                    const shouldAdd = force === undefined ? !this.classes.has(name) : Boolean(force);
                    if (shouldAdd) this.classes.add(name);
                    else this.classes.delete(name);
                },
                contains(name) { return this.classes.has(name); }
            },
            textContent: '',
            innerText: '',
            setAttribute() {},
            replaceChildren() {},
            appendChild() {},
            append() {}
        };
    }

    ['status', 'duelStatus', 'difficulty-overlay', 'diff-display-label'].forEach(id => elements.set(id, makeElement()));

    global.document = {
        getElementById(id) {
            return elements.get(id) || null;
        },
        createElement() {
            return makeElement();
        }
    };

    return { elements };
}

async function setupSocketEvents(overrides = {}) {
    setupDocumentStub();
    const { registerSocketEvents } = await import('../public/js/socketEvents.js');
    const socket = createSocketStub();
    const calls = {
        hideGuessControls: 0,
        showGuessControls: 0,
        opponentProgress: 0,
        roundFinished: []
    };

    const app = {
        isDailyMode: () => false,
        isDailyStartPending: () => false,
        isDuelMode: () => true,
        isSpectator: () => false,
        timer: { isHost: () => true, setHostStatus() {}, startRoundTimer() {}, hideRoundTimer() {} },
        getRoleBadgeLabel: () => ' · Host',
        setDuelRoundState() {},
        renderRoomScoreboard() {},
        renderOpponentProgress() { calls.opponentProgress += 1; },
        renderLiveBoard() {},
        resetLiveBoard() {},
        resetRoomScoreboard() {},
        setRoundFinished(value) { calls.roundFinished.push(Boolean(value)); },
        hideGuessControlsAfterLocalFinish() { calls.hideGuessControls += 1; },
        showGuessControlsForActiveRound() { calls.showGuessControls += 1; },
        renderGuessResult: () => true,
        showEndGamePopup() {},
        ...overrides
    };

    registerSocketEvents(socket, app);
    return { socket, calls, app };
}

test('duel guess result hides guess controls when local player finishes', async () => {
    const { socket, calls } = await setupSocketEvents();

    socket.emitEvent('guessResult', {
        guess: { name: 'Lewis Hamilton' },
        results: { name: 'green' },
        attempts: 3,
        isCorrect: true,
        isGameOver: true,
        target: { name: 'Lewis Hamilton' }
    });

    assert.equal(calls.hideGuessControls, 1);
    assert.deepEqual(calls.roundFinished, [true]);
});

test('duel room state keeps controls hidden for finished local player', async () => {
    const { socket, calls } = await setupSocketEvents();

    socket.emitEvent('roomStateUpdate', {
        room: {
            roundState: 'playing',
            playerCount: 2,
            maxPlayers: 2,
            scoreboard: [],
            you: { finished: true },
            players: [
                { isYou: true, finished: true, attempts: 4 },
                { isYou: false, finished: false, attempts: 2 }
            ]
        }
    });

    assert.equal(calls.hideGuessControls, 1);
    assert.equal(calls.showGuessControls, 0);
    assert.equal(calls.opponentProgress, 1);
});

test('duel room state shows guess controls for active local player', async () => {
    const { socket, calls } = await setupSocketEvents();

    socket.emitEvent('roomStateUpdate', {
        room: {
            roundState: 'playing',
            playerCount: 2,
            maxPlayers: 2,
            scoreboard: [],
            you: { finished: false },
            players: [
                { isYou: true, finished: false, attempts: 1 },
                { isYou: false, finished: true, attempts: 3 }
            ]
        }
    });

    assert.equal(calls.showGuessControls, 1);
    assert.equal(calls.hideGuessControls, 0);
});

test('duel initGame is processed after Daily state is cleared during Daily to Duel transition', async () => {
    let dailyMode = true;
    let dailyStartPending = true;
    let duelMode = false;
    let receivedDrivers = null;
    let initializedGrid = 0;
    const duelStates = [];
    let enterDuelCalls = 0;

    const { socket, calls } = await setupSocketEvents({
        isDailyMode: () => dailyMode,
        isDailyStartPending: () => dailyStartPending,
        isDuelMode: () => duelMode,
        setDailyMode(value) { dailyMode = Boolean(value); },
        setDriversList(drivers) { receivedDrivers = drivers; },
        initializeGridStructure() { initializedGrid += 1; },
        exitRematchMode() {},
        resetDuelLobby() {},
        resetOpponentProgress() {},
        enterDuelMode() {
            enterDuelCalls += 1;
            duelMode = true;
        },
        setDuelRoundState(state) { duelStates.push(state); }
    });

    const payload = {
        isSinglePlay: false,
        isDailyChallenge: false,
        difficulty: 'easy',
        timed: false,
        drivers: [{ id: 'VER', name: 'Max Verstappen' }]
    };

    socket.emitEvent('initGame', payload);

    assert.equal(receivedDrivers, null);
    assert.equal(initializedGrid, 0);
    assert.equal(calls.showGuessControls, 0);

    dailyStartPending = false;
    dailyMode = false;
    duelMode = true;

    socket.emitEvent('initGame', payload);

    assert.deepEqual(receivedDrivers, payload.drivers);
    assert.equal(initializedGrid, 1);
    assert.equal(enterDuelCalls, 1);
    assert.deepEqual(duelStates, ['playing']);
    assert.deepEqual(calls.roundFinished, [false]);
    assert.equal(calls.showGuessControls, 1);
});

