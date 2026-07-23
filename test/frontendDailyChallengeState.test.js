const test = require('node:test');
const assert = require('node:assert/strict');

function createClassList() {
    const classes = new Set();
    let toggleCount = 0;
    return {
        toggle(name, force) {
            toggleCount += 1;
            if (force) classes.add(name);
            else classes.delete(name);
        },
        contains(name) {
            return classes.has(name);
        },
        getToggleCount() {
            return toggleCount;
        },
        resetToggleCount() {
            toggleCount = 0;
        }
    };
}

function createControl(level) {
    return {
        tagName: 'BUTTON',
        dataset: { dailyLevel: level },
        classList: createClassList(),
        attributes: {},
        disabled: false,
        textContent: `Daily ${level}`,
        title: '',
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }
    };
}

test('Daily controls require login and consume server-claimed difficulties', async () => {
    const { createDailyChallengeState } = await import('../public/js/dailyChallengeState.js');
    const controls = ['easy', 'medium', 'hard'].map(createControl);
    const modeControl = {
        classList: createClassList(),
        title: ''
    };
    const info = {
        classList: createClassList(),
        textContent: ''
    };
    let currentUser = null;

    global.document = {
        querySelectorAll(selector) {
            return selector === '[data-daily-level]' ? controls : [];
        },
        querySelector(selector) {
            return selector === '[data-game-mode-choice="daily"]' ? modeControl : null;
        },
        getElementById(id) {
            return id === 'dailyResetInfo' ? info : null;
        }
    };

    const state = createDailyChallengeState({ getCurrentUser: () => currentUser });
    state.updateControls();

    assert.equal(controls.every(control => control.disabled), true);
    assert.equal(controls.every(control => control.classList.contains('daily-auth-required')), true);
    assert.match(info.textContent, /Autentifică-te/);
    assert.equal(state.canStart('easy'), false);

    currentUser = { id: 7, username: 'Narcis' };
    state.applyServerStatus({
        authenticated: true,
        dailyDate: '2026-07-23',
        nextResetAt: '2099-07-24T00:00:00.000Z',
        claimedDifficulties: ['easy']
    });

    assert.equal(controls[0].disabled, true);
    assert.equal(controls[0].classList.contains('daily-completed'), true);
    assert.equal(controls[1].disabled, false);
    assert.equal(controls[2].disabled, false);
    assert.equal(state.canStart('easy'), false);
    assert.equal(state.canStart('medium'), true);
    assert.match(info.textContent, /o încercare pe zi/);
});

test('Daily countdown updates cached text without rescanning controls until UTC reset', async () => {
    const { createDailyChallengeState } = await import('../public/js/dailyChallengeState.js');
    const controls = ['easy', 'medium', 'hard'].map(createControl);
    const modeControl = {
        classList: createClassList(),
        title: ''
    };
    const info = {
        classList: createClassList(),
        textContent: ''
    };
    const originalDateNow = Date.now;
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    let currentTime = Date.UTC(2099, 6, 23, 12, 0, 0);
    let intervalCallback = null;
    let controlQueries = 0;

    Date.now = () => currentTime;
    global.setInterval = callback => {
        intervalCallback = callback;
        return 1;
    };
    global.clearInterval = () => {};
    global.document = {
        querySelectorAll(selector) {
            if (selector === '[data-daily-level]') {
                controlQueries += 1;
                return controls;
            }
            return [];
        },
        querySelector(selector) {
            return selector === '[data-game-mode-choice="daily"]' ? modeControl : null;
        },
        getElementById(id) {
            return id === 'dailyResetInfo' ? info : null;
        }
    };

    try {
        const state = createDailyChallengeState({
            getCurrentUser: () => ({ id: 7, username: 'Narcis' })
        });
        const nextResetAt = currentTime + 10_000;
        state.applyServerStatus({
            authenticated: true,
            dailyDate: '2099-07-23',
            nextResetAt: new Date(nextResetAt).toISOString(),
            claimedDifficulties: ['easy']
        });
        state.startCountdown();

        assert.equal(typeof intervalCallback, 'function');
        const completedText = controls[0].textContent;
        controls.forEach(control => control.classList.resetToggleCount());
        info.classList.resetToggleCount();
        controlQueries = 0;
        currentTime += 1_000;
        intervalCallback();

        assert.equal(controlQueries, 0);
        assert.equal(controls.every(control => control.classList.getToggleCount() === 0), true);
        assert.equal(info.classList.getToggleCount(), 0);
        assert.notEqual(controls[0].textContent, completedText);
        assert.match(info.textContent, /00:00:09/);

        currentTime = nextResetAt + 1;
        intervalCallback();

        assert.equal(controlQueries, 1);
        assert.equal(controls[0].disabled, false);
        assert.equal(controls[0].classList.contains('daily-completed'), false);
    } finally {
        Date.now = originalDateNow;
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    }
});
