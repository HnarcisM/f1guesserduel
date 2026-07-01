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

function createElement({ classes = [] } = {}) {
    const attrs = new Map();
    return {
        classList: createClassList(classes),
        textContent: '',
        disabled: false,
        removeAttribute(name) { attrs.delete(name); },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        replaceChildren() {},
        append() {}
    };
}

function setupDocumentStub() {
    const elements = new Map([
        ['endGameDisplay', createElement(['show'])],
        ['endGameBackdrop', createElement(['show'])],
        ['gameZone', createElement(['game-zone-hidden', 'is-player-finished'])],
        ['status', createElement(['is-hidden'])],
        ['sendGuessBtn', createElement()]
    ]);
    elements.get('sendGuessBtn').disabled = true;

    global.document = {
        getElementById(id) {
            return elements.get(id) || null;
        },
        createElement() {
            return createElement();
        },
        createTextNode(text) {
            return { textContent: String(text) };
        }
    };

    return { elements };
}

test('closing end-game popup after a finished Duel enables inline rematch button', async () => {
    const { createEndGameController } = await import('../public/js/endGameController.js');
    const { elements } = setupDocumentStub();
    let isRoundFinished = true;

    const controller = createEndGameController({
        roleState: {
            isSpectator: () => false,
            requirePlayer: () => true
        },
        timer: {
            stopRoundTimer() {},
            buildRestartOptions: () => ({})
        },
        dailyChallengeState: {
            getCountdownText: () => '24h'
        },
        getSocket: () => ({ emit() {} }),
        getIsDailyMode: () => false,
        getIsDuelMode: () => true,
        getIsSingleMode: () => false,
        getIsRoundFinished: () => isRoundFinished,
        setRoundFinished(value) { isRoundFinished = Boolean(value); }
    });

    controller.hideEndGamePopup(true);

    const sendBtn = elements.get('sendGuessBtn');
    const gameZone = elements.get('gameZone');

    assert.equal(controller.isRematchMode(), true);
    assert.equal(sendBtn.textContent, '🔄 Rematch');
    assert.equal(sendBtn.disabled, false);
    assert.equal(sendBtn.classList.contains('rematch-submit-btn'), true);
    assert.equal(gameZone.classList.contains('game-zone-hidden'), false);
    assert.equal(gameZone.classList.contains('game-zone-rematch'), true);
});
