const test = require('node:test');
const assert = require('node:assert/strict');

function createClassList() {
    const classes = new Set();
    return {
        toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
        },
        contains(name) {
            return classes.has(name);
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
