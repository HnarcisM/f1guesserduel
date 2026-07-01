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

function createElement({ dataset = {}, classes = [] } = {}) {
    const listeners = new Map();
    return {
        dataset: { ...dataset },
        classList: createClassList(classes),
        attributes: {},
        disabled: false,
        textContent: '',
        addEventListener(eventName, handler) { listeners.set(eventName, handler); },
        click() {
            const handler = listeners.get('click');
            if (handler) handler({ target: this });
        },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; }
    };
}

function setupLobbyDocument() {
    const levelButtons = [
        createElement({ dataset: { duelLobbyLevel: 'easy' } }),
        createElement({ dataset: { duelLobbyLevel: 'medium' } }),
        createElement({ dataset: { duelLobbyLevel: 'hard' } })
    ];
    const timerButtons = [
        createElement({ dataset: { timerMode: 'off' } }),
        createElement({ dataset: { timerMode: '60' } })
    ];
    const startButton = createElement();
    const leaveButton = createElement();

    global.document = {
        querySelectorAll(selector) {
            if (selector === '[data-duel-lobby-level]') return levelButtons;
            if (selector === '#duelLobbyPanel [data-timer-mode]') return timerButtons;
            if (selector === '.duel-lobby-select-player-btn') return [];
            return [];
        },
        getElementById(id) {
            if (id === 'duelLobbyStartBtn') return startButton;
            if (id === 'duelLobbyLeaveBtn') return leaveButton;
            return null;
        }
    };

    return { levelButtons, timerButtons, startButton, leaveButton };
}

test('Duel lobby leave button calls the provided leave-room handler', async () => {
    const { setupDuelLobbyView } = await import('../public/js/duelLobbyView.js');
    const dom = setupLobbyDocument();
    let leaveCount = 0;

    setupDuelLobbyView({
        onStartRound: () => {},
        onSelectPlayer: () => {},
        onLeaveRoom: () => { leaveCount += 1; },
        timer: { setTimedMode() {} }
    });

    dom.leaveButton.click();

    assert.equal(leaveCount, 1);
});
