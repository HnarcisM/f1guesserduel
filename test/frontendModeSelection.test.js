const test = require('node:test');
const assert = require('node:assert/strict');

function createClassList(initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
        add(...names) {
            names.forEach(name => classes.add(name));
        },
        remove(...names) {
            names.forEach(name => classes.delete(name));
        },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            return shouldAdd;
        },
        contains(name) {
            return classes.has(name);
        },
        toArray() {
            return Array.from(classes);
        }
    };
}

function createElement({ id = '', dataset = {}, classes = [] } = {}) {
    const listeners = new Map();
    return {
        id,
        dataset: { ...dataset },
        classList: createClassList(classes),
        attributes: {},
        textContent: '',
        addEventListener(eventName, handler) {
            listeners.set(eventName, handler);
        },
        click() {
            const handler = listeners.get('click');
            if (handler) handler({ target: this });
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        }
    };
}

function setupModeSelectionDocument() {
    const elementsById = new Map();
    const body = createElement();
    const modeControls = [
        createElement({ dataset: { gameModeChoice: 'single' } }),
        createElement({ dataset: { gameModeChoice: 'duel' } }),
        createElement({ dataset: { gameModeChoice: 'daily' } })
    ];

    elementsById.set('difficultySection', createElement());
    elementsById.set('dailyChallengePanel', createElement({ classes: ['is-hidden'] }));
    elementsById.set('status', createElement());

    global.document = {
        body,
        querySelectorAll(selector) {
            if (selector === '[data-game-mode-choice]') return modeControls;
            return [];
        },
        getElementById(id) {
            return elementsById.get(id) || null;
        }
    };

    return {
        body,
        modeControls,
        difficultySection: elementsById.get('difficultySection'),
        dailyPanel: elementsById.get('dailyChallengePanel'),
        status: elementsById.get('status')
    };
}

test('mode selection shows Daily panel only after Daily is selected', async () => {
    const { createGameModeController } = await import('../public/js/gameModeController.js');
    const { createGameModeSelectionController } = await import('../public/js/gameModeSelectionController.js');
    const dom = setupModeSelectionDocument();
    const gameModeController = createGameModeController();
    const controller = createGameModeSelectionController({
        gameModeController,
        startDuelMode: () => 'ROOM1',
        startDailyChallenge: () => {},
        onSingleSelected: () => {}
    });

    controller.setup();
    dom.modeControls.find(control => control.dataset.gameModeChoice === 'daily').click();

    assert.equal(gameModeController.isDaily(), true);
    assert.equal(dom.dailyPanel.classList.contains('is-hidden'), false);
    assert.equal(dom.dailyPanel.getAttribute('aria-hidden'), 'false');
    assert.equal(dom.difficultySection.classList.contains('is-hidden'), true);
    assert.equal(dom.status.textContent, 'Daily Challenge: alege dificultatea Daily.');

    dom.modeControls.find(control => control.dataset.gameModeChoice === 'single').click();

    assert.equal(gameModeController.isSingle(), true);
    assert.equal(dom.dailyPanel.classList.contains('is-hidden'), true);
    assert.equal(dom.dailyPanel.getAttribute('aria-hidden'), 'true');
    assert.equal(dom.difficultySection.classList.contains('is-hidden'), false);
    assert.equal(dom.status.textContent, 'Single Play: selectează dificultatea pentru jocul solo.');
});

test('mode selection blocks Daily when active duel leave confirmation is cancelled', async () => {
    const { createGameModeController } = await import('../public/js/gameModeController.js');
    const { createGameModeSelectionController } = await import('../public/js/gameModeSelectionController.js');
    const dom = setupModeSelectionDocument();
    const gameModeController = createGameModeController();
    let startedDaily = false;
    let singleSelected = false;

    const controller = createGameModeSelectionController({
        gameModeController,
        startDuelMode: () => 'ROOM1',
        startDailyChallenge: () => { startedDaily = true; },
        onSingleSelected: () => { singleSelected = true; },
        confirmDuelExit: () => false
    });

    controller.setup();
    gameModeController.enterDuel({ roomId: 'ROOM1' });
    controller.updateModeSelection('duel');

    dom.modeControls.find(control => control.dataset.gameModeChoice === 'daily').click();

    assert.equal(gameModeController.isDuel(), true);
    assert.equal(startedDaily, false);
    assert.equal(singleSelected, false);
    assert.equal(dom.dailyPanel.classList.contains('is-hidden'), true);
});

test('mode selection allows Daily after confirmed active duel exit', async () => {
    const { createGameModeController } = await import('../public/js/gameModeController.js');
    const { createGameModeSelectionController } = await import('../public/js/gameModeSelectionController.js');
    const dom = setupModeSelectionDocument();
    const gameModeController = createGameModeController();
    let confirmTarget = null;

    const controller = createGameModeSelectionController({
        gameModeController,
        startDuelMode: () => 'ROOM1',
        startDailyChallenge: () => {},
        onSingleSelected: () => {},
        confirmDuelExit: (target) => {
            confirmTarget = target;
            return 'left-duel';
        }
    });

    controller.setup();
    gameModeController.enterDuel({ roomId: 'ROOM1' });
    controller.updateModeSelection('duel');

    dom.modeControls.find(control => control.dataset.gameModeChoice === 'daily').click();

    assert.equal(confirmTarget, 'daily');
    assert.equal(gameModeController.isDaily(), true);
    assert.equal(dom.dailyPanel.classList.contains('is-hidden'), false);
    assert.equal(dom.difficultySection.classList.contains('is-hidden'), true);
});
