const assert = require('node:assert/strict');
const test = require('node:test');

const controllerModulePromise = import('../public/js/feedbackController.js');

async function importController() {
    return controllerModulePromise;
}

function createClassList() {
    const values = new Set();
    return {
        add(...names) { for (const name of names) values.add(name); },
        remove(...names) { for (const name of names) values.delete(name); },
        contains(name) { return values.has(name); }
    };
}

function createElement(id, tagName = 'button') {
    const listeners = new Map();
    const element = {
        id,
        tagName: tagName.toUpperCase(),
        checked: false,
        disabled: false,
        hidden: false,
        inert: true,
        textContent: '',
        dataset: {},
        attributes: {},
        classList: createClassList(),
        focusCalls: 0,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatch(type, event = {}) {
            for (const handler of listeners.get(type) || []) handler({ target: this, ...event });
        },
        focus() { this.focusCalls += 1; },
        querySelectorAll() { return []; },
        closest(selector) {
            if (selector.includes('button') && this.tagName === 'BUTTON') return this;
            if (selector.includes('summary') && this.tagName === 'SUMMARY') return this;
            if (selector.includes('[role="button"]') && this.getAttribute('role') === 'button') return this;
            return null;
        }
    };
    return element;
}

function createDocument() {
    const ids = [
        'feedbackSettingsPanel',
        'feedbackSettingsBackdrop',
        'feedbackSettingsCloseBtn',
        'feedbackSettingsBtn',
        'authFeedbackSettingsBtn',
        'feedbackSoundToggle',
        'feedbackHapticsToggle',
        'feedbackPreviewBtn',
        'authFeedbackSettingsSummary',
        'feedbackHapticsSupport',
        'feedbackSettingsStatus'
    ];
    const elements = new Map(ids.map(id => [id, createElement(id, id.includes('Panel') ? 'section' : 'button')]));
    const documentListeners = new Map();
    const documentObject = {
        activeElement: null,
        getElementById(id) { return elements.get(id) || null; },
        addEventListener(type, handler) {
            if (!documentListeners.has(type)) documentListeners.set(type, []);
            documentListeners.get(type).push(handler);
        },
        dispatch(type, event) {
            for (const handler of documentListeners.get(type) || []) handler(event);
        }
    };
    return { documentObject, elements };
}

function withGlobalDocument(documentObject, callback) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentObject });
    return Promise.resolve()
        .then(callback)
        .finally(() => {
            if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
            else delete globalThis.document;
        });
}

test('feedback settings normalize malformed storage and classify guesses', async () => {
    const {
        DEFAULT_FEEDBACK_SETTINGS,
        normalizeFeedbackSettings,
        parseFeedbackSettings,
        classifyGuessFeedback
    } = await importController();

    assert.deepEqual(normalizeFeedbackSettings(null), DEFAULT_FEEDBACK_SETTINGS);
    assert.deepEqual(normalizeFeedbackSettings({ soundEnabled: false }), {
        soundEnabled: false,
        hapticsEnabled: true
    });
    assert.deepEqual(parseFeedbackSettings('{invalid'), DEFAULT_FEEDBACK_SETTINGS);
    assert.deepEqual(parseFeedbackSettings(JSON.stringify({ hapticsEnabled: false })), {
        soundEnabled: true,
        hapticsEnabled: false
    });
    assert.equal(classifyGuessFeedback({ isCorrect: true }), 'correct');
    assert.equal(classifyGuessFeedback({ results: { name: 'red', age: 'green' } }), 'partial');
    assert.equal(classifyGuessFeedback({ results: { name: 'red', age: 'orange' } }), 'wrong');
    assert.equal(classifyGuessFeedback(), 'wrong');
});

test('one feedback controller powers both header and profile triggers', async () => {
    const { createFeedbackController, FEEDBACK_STORAGE_KEY } = await importController();
    const { documentObject, elements } = createDocument();
    const sounds = [];
    const haptics = [];
    const writes = [];
    const controller = createFeedbackController({
        documentObject,
        windowObject: {},
        navigatorObject: { vibrate() { return true; } },
        readStorage(key) {
            assert.equal(key, FEEDBACK_STORAGE_KEY);
            return JSON.stringify({ soundEnabled: false, hapticsEnabled: true });
        },
        writeStorage(key, value) { writes.push({ key, value }); return true; },
        playSoundEffect(effect) { sounds.push(effect); return true; },
        playHapticEffect(effect) { haptics.push(effect); return true; }
    });

    await withGlobalDocument(documentObject, () => {
        assert.equal(controller.setup(), true);
        assert.equal(elements.get('feedbackSoundToggle').checked, false);
        assert.equal(elements.get('feedbackHapticsToggle').checked, true);
        assert.match(elements.get('authFeedbackSettingsSummary').textContent, /Sunete: oprite/);
        assert.match(elements.get('feedbackHapticsSupport').textContent, /disponibile/);

        elements.get('feedbackSettingsBtn').dispatch('click');
        assert.equal(elements.get('feedbackSettingsPanel').classList.contains('show'), true);
        assert.equal(elements.get('feedbackSettingsPanel').getAttribute('aria-hidden'), 'false');
        controller.closePanel();
        assert.equal(elements.get('feedbackSettingsPanel').classList.contains('show'), false);

        elements.get('authFeedbackSettingsBtn').dispatch('click');
        assert.equal(elements.get('feedbackSettingsPanel').classList.contains('show'), true);
        elements.get('feedbackSettingsCloseBtn').dispatch('click');

        elements.get('feedbackSoundToggle').checked = true;
        elements.get('feedbackSoundToggle').dispatch('change');
        assert.deepEqual(controller.getSettings(), { soundEnabled: true, hapticsEnabled: true });
        assert.equal(sounds.at(-1), 'tap');

        elements.get('feedbackHapticsToggle').checked = false;
        elements.get('feedbackHapticsToggle').dispatch('change');
        assert.deepEqual(controller.getSettings(), { soundEnabled: true, hapticsEnabled: false });
        assert.equal(writes.length, 2);
        assert.deepEqual(JSON.parse(writes.at(-1).value), controller.getSettings());

        assert.equal(controller.triggerGuessResult({ results: { name: 'green' } }), 'partial');
        assert.equal(controller.triggerRoundResult('win'), 'win');
        assert.equal(controller.triggerRoundResult('unknown'), 'error');
        assert.deepEqual(sounds.slice(-3), ['partial', 'win', 'error']);
        assert.equal(controller.getLastTrigger(), 'error');

        const soundCount = sounds.length;
        const hapticCount = haptics.length;
        controller.updateSettings({ soundEnabled: false, hapticsEnabled: false });
        assert.equal(controller.trigger('correct'), false);
        assert.equal(sounds.length, soundCount);
        assert.equal(haptics.length, hapticCount);
    });
});

test('preview, interaction filtering and unsupported haptics remain defensive', async () => {
    const { createFeedbackController } = await importController();
    const { documentObject, elements } = createDocument();
    const effects = [];
    const controller = createFeedbackController({
        documentObject,
        windowObject: {},
        navigatorObject: {},
        readStorage: () => JSON.stringify({ soundEnabled: true, hapticsEnabled: false }),
        writeStorage: () => false,
        playSoundEffect(effect) { effects.push(effect); return true; },
        playHapticEffect() { throw new Error('must stay disabled'); }
    });

    await withGlobalDocument(documentObject, () => {
        controller.setup();
        assert.match(elements.get('feedbackHapticsSupport').textContent, /nu oferă vibrații/);
        assert.equal(controller.isHapticsSupported(), false);

        elements.get('feedbackPreviewBtn').dispatch('click');
        assert.equal(effects.at(-1), 'preview');
        assert.match(elements.get('feedbackSettingsStatus').textContent, /redat/);

        const regularButton = createElement('regularBtn');
        documentObject.dispatch('click', { target: regularButton });
        assert.equal(effects.at(-1), 'tap');

        const sendButton = createElement('sendGuessBtn');
        documentObject.dispatch('click', { target: sendButton });
        assert.equal(effects.filter(effect => effect === 'tap').length, 1);

        const disabledButton = createElement('disabledBtn');
        disabledButton.disabled = true;
        documentObject.dispatch('click', { target: disabledButton });
        const silentButton = createElement('silentBtn');
        silentButton.dataset.feedbackSilent = 'true';
        documentObject.dispatch('click', { target: silentButton });
        const ariaDisabled = createElement('ariaDisabled');
        ariaDisabled.setAttribute('aria-disabled', 'true');
        documentObject.dispatch('click', { target: ariaDisabled });
        assert.equal(effects.filter(effect => effect === 'tap').length, 1);
    });
});

test('synth sound and haptic players use browser capabilities lazily', async () => {
    const { createSynthSoundPlayer, createHapticPlayer } = await importController();
    const calls = { resume: 0, oscillator: 0, gain: 0, vibrate: [] };

    class FakeAudioContext {
        constructor() {
            this.state = 'suspended';
            this.currentTime = 2;
            this.destination = {};
        }
        resume() { calls.resume += 1; this.state = 'running'; }
        createOscillator() {
            calls.oscillator += 1;
            return {
                type: '',
                frequency: { setValueAtTime() {} },
                connect() {},
                start() {},
                stop() {}
            };
        }
        createGain() {
            calls.gain += 1;
            return {
                gain: {
                    setValueAtTime() {},
                    exponentialRampToValueAtTime() {}
                },
                connect() {}
            };
        }
    }

    const playSound = createSynthSoundPlayer({ windowObject: { AudioContext: FakeAudioContext } });
    assert.equal(playSound('correct'), true);
    assert.equal(calls.resume, 1);
    assert.equal(calls.oscillator, 3);
    assert.equal(calls.gain, 3);
    assert.equal(playSound('unknown-effect'), true);
    assert.equal(calls.oscillator, 4);
    assert.equal(createSynthSoundPlayer({ windowObject: {} })('tap'), false);

    const playHaptic = createHapticPlayer({
        navigatorObject: { vibrate(pattern) { calls.vibrate.push(pattern); return true; } }
    });
    assert.equal(playHaptic('win'), true);
    assert.deepEqual(calls.vibrate[0], [20, 35, 20, 35, 60]);
    assert.equal(createHapticPlayer({ navigatorObject: {} })('tap'), false);
    assert.equal(createHapticPlayer({ navigatorObject: { vibrate() { throw new Error('blocked'); } } })('tap'), false);
});

test('controller is inert when the shared settings panel is absent', async () => {
    const { createFeedbackController } = await importController();
    const controller = createFeedbackController({
        documentObject: { getElementById() { return null; } },
        windowObject: {},
        navigatorObject: {},
        readStorage: () => null,
        writeStorage: () => false,
        playSoundEffect: () => false,
        playHapticEffect: () => false
    });
    assert.equal(controller.setup(), false);
    assert.equal(controller.openPanel(), false);
    assert.equal(controller.closePanel(), false);
    assert.equal(controller.trigger('tap'), false);
});

function createSocketStub({ outgoingSupport = true } = {}) {
    const listeners = new Map();
    const outgoingListeners = new Set();
    return {
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
        },
        off(eventName, handler) {
            if (handler) listeners.get(eventName)?.delete(handler);
            else listeners.delete(eventName);
        },
        ...(outgoingSupport ? {
            onAnyOutgoing(handler) { outgoingListeners.add(handler); },
            offAnyOutgoing(handler) { outgoingListeners.delete(handler); }
        } : {}),
        receive(eventName, payload) {
            for (const handler of listeners.get(eventName) || []) handler(payload);
        },
        send(eventName, ...args) {
            for (const handler of outgoingListeners) handler(eventName, ...args);
        },
        listenerCount(eventName) {
            return listeners.get(eventName)?.size || 0;
        },
        outgoingListenerCount() {
            return outgoingListeners.size;
        }
    };
}

test('one socket bridge drives guess, result, timeout and error feedback', async () => {
    const { createFeedbackController } = await importController();
    const { documentObject } = createDocument();
    const effects = [];
    let now = 1_000;
    const controller = createFeedbackController({
        documentObject,
        windowObject: {},
        navigatorObject: {},
        readStorage: () => JSON.stringify({ soundEnabled: true, hapticsEnabled: false }),
        writeStorage: () => true,
        playSoundEffect(effect) { effects.push(effect); return true; },
        playHapticEffect: () => false,
        clock: () => now
    });
    const socket = createSocketStub();

    await withGlobalDocument(documentObject, () => {
        controller.setup();
        assert.equal(controller.attachSocket(socket), true);
        assert.equal(socket.outgoingListenerCount(), 1);
        assert.equal(socket.listenerCount('guessResult'), 1);

        socket.send('submitGuess', { driverId: 'hamilton' });
        socket.send('submitGuess', { driverId: 'hamilton' });
        assert.deepEqual(effects, ['guess']);

        now += 100;
        socket.send('submitSingleGuess', { driverId: 'verstappen' });
        now += 100;
        socket.send('submitDailyGuess', { driverId: 'leclerc' });
        socket.send('joinRoom', { roomId: 'ROOM' });
        assert.deepEqual(effects.slice(-2), ['guess', 'guess']);

        socket.receive('guessResult', { results: { team: 'green' }, isCorrect: false });
        socket.receive('dailyGuessResult', { results: {}, isCorrect: true });
        socket.receive('roundResolved', { resultForYou: { outcome: 'pending' } });
        socket.receive('roundResolved', { resultForYou: { outcome: 'win' } });
        socket.receive('gameTimedOut', {});
        socket.receive('gameTimedOut', { roundResult: { resultForYou: { outcome: 'draw' } } });
        socket.receive('roomFull');
        socket.receive('errorMessage', 'failed');
        socket.receive('dailyChallengeError', 'failed');
        assert.deepEqual(effects.slice(-8), [
            'partial', 'correct', 'win', 'timeout', 'draw', 'error', 'error', 'error'
        ]);

        controller.detachSocket();
        assert.equal(socket.outgoingListenerCount(), 0);
        assert.equal(socket.listenerCount('guessResult'), 0);
        socket.receive('guessResult', { isCorrect: true });
        assert.equal(effects.at(-1), 'error');
    });
});

test('guess feedback falls back to the button and Enter when outgoing socket hooks are unavailable', async () => {
    const { createFeedbackController } = await importController();
    const { documentObject } = createDocument();
    const effects = [];
    let now = 2_000;
    const controller = createFeedbackController({
        documentObject,
        windowObject: {},
        navigatorObject: {},
        readStorage: () => JSON.stringify({ soundEnabled: true, hapticsEnabled: false }),
        writeStorage: () => true,
        playSoundEffect(effect) { effects.push(effect); return true; },
        playHapticEffect: () => false,
        clock: () => now
    });

    await withGlobalDocument(documentObject, () => {
        controller.setup();
        controller.attachSocket(createSocketStub({ outgoingSupport: false }));

        documentObject.dispatch('click', { target: createElement('sendGuessBtn') });
        now += 100;
        documentObject.dispatch('keydown', {
            target: createElement('driverInput', 'input'),
            key: 'Enter',
            repeat: false
        });
        documentObject.dispatch('keydown', {
            target: createElement('driverInput', 'input'),
            key: 'Enter',
            repeat: true
        });
        assert.deepEqual(effects, ['guess', 'guess']);
    });
});

test('standalone installer reuses one controller and attaches current and future game sockets', async () => {
    const { installFeedbackController } = await importController();
    const { documentObject } = createDocument();
    const windowListeners = new Map();
    const currentSocket = createSocketStub();
    const windowObject = {
        document: documentObject,
        navigator: {},
        __f1GameSocket: currentSocket,
        addEventListener(eventName, handler) {
            if (!windowListeners.has(eventName)) windowListeners.set(eventName, []);
            windowListeners.get(eventName).push(handler);
        }
    };

    await withGlobalDocument(documentObject, () => {
        const controller = installFeedbackController(windowObject);
        assert.ok(controller);
        assert.equal(windowObject.__f1FeedbackController, controller);
        assert.equal(currentSocket.listenerCount('guessResult'), 1);
        assert.equal(installFeedbackController(windowObject), controller);

        const futureSocket = createSocketStub();
        for (const handler of windowListeners.get('f1:socket-created') || []) {
            handler({ detail: { socket: futureSocket } });
        }
        assert.equal(currentSocket.listenerCount('guessResult'), 0);
        assert.equal(futureSocket.listenerCount('guessResult'), 1);
    });

    assert.equal(installFeedbackController({}), null);
});
