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
    const listeners = new Map();
    const children = [];
    return {
        classList: createClassList(classes),
        textContent: '',
        disabled: false,
        hidden: false,
        addEventListener(name, handler) { listeners.set(name, handler); },
        focus() { global.document.activeElement = this; },
        querySelectorAll() { return []; },
        removeAttribute(name) { attrs.delete(name); },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        replaceChildren(...nextChildren) {
            children.splice(0, children.length, ...nextChildren);
        },
        appendChild(child) {
            children.push(child);
            return child;
        },
        append(...nextChildren) { children.push(...nextChildren); },
        children,
        listeners
    };
}

function setupDocumentStub() {
    const elements = new Map([
        ['endGameDisplay', createElement(['show'])],
        ['endGameBackdrop', createElement(['show'])],
        ['gameZone', createElement(['game-zone-hidden', 'is-player-finished'])],
        ['status', createElement(['is-hidden'])],
        ['sendGuessBtn', createElement()],
        ['closeEndGamePopup', createElement()],
        ['menu-hamburger', createElement()],
        ['endGameTitle', createElement()],
        ['endGameMessage', createElement()],
        ['restartGameBtn', createElement()],
        ['endGameReward', createElement({ classes: ['is-hidden'] })],
        ['endGameRewardOutcome', createElement()],
        ['endGameXpAwarded', createElement()],
        ['endGameRewardLevel', createElement()],
        ['endGameLevelUpMessage', createElement({ classes: ['is-hidden'] })],
        ['endGameBadgeEmpty', createElement()],
        ['endGameBadgeList', createElement({ classes: ['is-hidden'] })]
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
    assert.equal(elements.get('endGameDisplay').getAttribute('aria-hidden'), 'true');
    assert.equal(global.document.activeElement, sendBtn);
});

test('closing the popup returns focus to the menu when rematch is unavailable', async () => {
    const { createEndGameController } = await import('../public/js/endGameController.js');
    const { elements } = setupDocumentStub();
    const controller = createEndGameController({
        roleState: {
            isSpectator: () => true,
            requirePlayer: () => false
        },
        timer: {
            stopRoundTimer() {},
            buildRestartOptions: () => ({})
        },
        dailyChallengeState: {
            getCountdownText: () => '24h'
        },
        getSocket: () => null,
        getIsDailyMode: () => false,
        getIsDuelMode: () => true,
        getIsSingleMode: () => false,
        getIsRoundFinished: () => true,
        setRoundFinished() {}
    });

    controller.hideEndGamePopup(true);

    assert.equal(controller.isRematchMode(), false);
    assert.equal(global.document.activeElement, elements.get('menu-hamburger'));
});

test('authenticated reward combines result, XP, level-up and newly unlocked badges', async () => {
    const { createEndGameController } = await import('../public/js/endGameController.js');
    const { elements } = setupDocumentStub();
    let isRoundFinished = false;
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
        getSocket: () => null,
        getIsDailyMode: () => false,
        getIsDuelMode: () => false,
        getIsSingleMode: () => true,
        getIsRoundFinished: () => isRoundFinished,
        setRoundFinished(value) { isRoundFinished = Boolean(value); }
    });

    controller.showEndGamePopup({ isCorrect: true, attempts: 1, target: { name: 'Pilot' } });
    controller.showAccountReward({
        mode: 'single',
        outcome: 'win',
        xpAwarded: 50,
        previousLevel: 1,
        level: 2,
        leveledUp: true,
        unlockedAchievements: [{
            key: 'pole-position',
            title: 'Pole Position',
            description: 'Ghicește pilotul din prima încercare.',
            icon: '⚡'
        }]
    });

    assert.equal(elements.get('endGameReward').hidden, false);
    assert.equal(elements.get('endGameReward').classList.contains('is-hidden'), false);
    assert.equal(elements.get('endGameRewardOutcome').textContent, 'Victorie · Single');
    assert.equal(elements.get('endGameXpAwarded').textContent, '+50 XP');
    assert.equal(elements.get('endGameRewardLevel').textContent, 'Nivel 1 → 2');
    assert.equal(elements.get('endGameLevelUpMessage').hidden, false);
    assert.equal(elements.get('endGameBadgeEmpty').classList.contains('is-hidden'), true);
    assert.equal(elements.get('endGameBadgeList').children.length, 1);
    assert.equal(elements.get('endGameBadgeList').children[0].children[1].children[0].textContent, 'Pole Position');
});

test('end-game dialog has an accessible name, description and no global Enter shortcut', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const globalEvents = fs.readFileSync(path.join(root, 'public', 'js', 'globalDocumentEventsController.js'), 'utf8');

    assert.match(html, /id="endGameDisplay"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="endGameTitle"[^>]*aria-describedby="endGameMessage"[^>]*aria-hidden="true"[^>]*tabindex="-1"/);
    assert.doesNotMatch(globalEvents, /e\.key === ['"]Enter['"]/);
});
