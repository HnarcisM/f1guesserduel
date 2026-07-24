const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const {
    createE2EContext,
    logE2E,
    openAppPage,
    openRoomPage,
    requirePlaywright,
    startAppServer
} = require('./e2eTestHarness');
const { startReadyDuelRound } = require('./duelReadyE2eHelpers');

async function pickFirstSuggestion(page, query) {
    await page.locator('#driverInput').fill(query);
    const firstSuggestion = page.locator('#suggestions li').first();
    await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
    const selectedName = (await firstSuggestion.textContent()).trim();
    await firstSuggestion.click();
    return selectedName;
}


async function openAuthPanel(page) {
    const panel = page.locator('#authPanel');
    const isOpen = await panel.evaluate(element => element.classList.contains('show')).catch(() => false);

    if (!isOpen) {
        await page.locator('#authOpenBtn').click({ force: true });
    }

    await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
}

async function closeAuthPanel(page) {
    const isOpen = await page.locator('#authPanel').evaluate(element => element.classList.contains('show')).catch(() => false);
    if (!isOpen) return;

    await page.locator('#authCloseBtn').click({ force: true });
    await assertEventually(async () => {
        const stillOpen = await page.locator('#authPanel').evaluate(element => element.classList.contains('show'));
        assert.equal(stillOpen, false);
    });
}

async function ensureAuthMode(page, expectedMode) {
    await openAuthPanel(page);
    const submitText = (await page.locator('#authSubmitBtn').textContent()) || '';
    const isRegisterMode = /Creează cont/i.test(submitText);

    if (expectedMode === 'register' && !isRegisterMode) {
        await page.locator('#authSwitchBtn').click({ force: true });
    }

    if (expectedMode === 'login' && isRegisterMode) {
        await page.locator('#authSwitchBtn').click({ force: true });
    }
}

async function submitAuthForm(page) {
    await page.locator('#authForm').evaluate(form => form.requestSubmit());
}

async function registerViaUi(page, { username, email, password }) {
    await ensureAuthMode(page, 'register');
    await page.locator('#authUsername').fill(username);
    await page.locator('#authEmail').fill(email);
    await page.locator('#authPassword').fill(password);
    await submitAuthForm(page);
    await expectText(page.locator('#authMessage'), /Bun venit|Autentificare reușită/i);
    await expectText(page.locator('#authOpenBtn'), new RegExp(username));
    await closeAuthPanel(page);
}

async function logoutViaUi(page) {
    await openAuthPanel(page);
    await page.locator('#authLogoutBtn:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
    await page.locator('#authLogoutBtn').click({ force: true });
    await expectText(page.locator('#authOpenBtn'), /Login/i);
    await closeAuthPanel(page);
}

async function loginViaUi(page, { email, password, username }) {
    await ensureAuthMode(page, 'login');
    await page.locator('#authEmail').fill(email);
    await page.locator('#authPassword').fill(password);
    await submitAuthForm(page);
    await expectText(page.locator('#authMessage'), /Bun venit|Autentificare reușită/i);
    await expectText(page.locator('#authOpenBtn'), new RegExp(username));
    await closeAuthPanel(page);
}

async function waitForGameInputReady(page, timeout = 7000) {
    const popup = page.locator('#endGameDisplay.show');
    const input = page.locator('#driverInput');

    const popupAlreadyVisible = await popup.isVisible().catch(() => false);
    if (popupAlreadyVisible) return 'ended';

    try {
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout });
        await input.waitFor({ state: 'visible', timeout });
        await assertEventually(async () => {
            const editable = await input.evaluate(element => !element.disabled && !element.readOnly);
            assert.equal(editable, true);
        }, timeout);
        return 'ready';
    } catch (error) {
        const endedWhileWaiting = await popup.isVisible().catch(() => false);
        if (endedWhileWaiting) return 'ended';
        throw error;
    }
}

async function makeGuess(page, query) {
    const state = await waitForGameInputReady(page);
    if (state === 'ended') return false;

    await pickFirstSuggestion(page, query);
    return true;
}

async function finishRoundByGuessing(page, options = {}) {
    const { waitForPopup = true } = options;
    const guesses = ['Arvid', 'Andrea', 'Gabriel', 'Isack', 'Franco', 'Oliver'];
    const popup = page.locator('#endGameDisplay.show');

    for (const query of guesses) {
        const guessed = await makeGuess(page, query);
        if (!guessed) return;

        const popupAppeared = await popup.waitFor({ state: 'visible', timeout: 1500 })
            .then(() => true)
            .catch(() => false);
        if (popupAppeared) return;

        const localPlayerFinished = await page.locator('#gameZone.game-zone-hidden, #gameZone.is-player-finished')
            .count()
            .then(count => count > 0)
            .catch(() => false);

        if (localPlayerFinished) {
            if (waitForPopup) {
                await popup.waitFor({ timeout: 7000 });
            }
            return;
        }
    }

    if (waitForPopup) {
        await popup.waitFor({ timeout: 7000 });
    }
}


async function finishRoundWithWrongEasyGuesses(page, options = {}) {
    const { waitForPopup = true } = options;
    const guesses = ['Andrea', 'Gabriel', 'Isack', 'Franco', 'Oliver', 'Liam'];
    const popup = page.locator('#endGameDisplay.show');

    for (const query of guesses) {
        const guessed = await makeGuess(page, query);
        if (!guessed) return;

        const popupAppeared = await popup.waitFor({ state: 'visible', timeout: 1500 })
            .then(() => true)
            .catch(() => false);
        if (popupAppeared) return;
    }

    if (waitForPopup) {
        await popup.waitFor({ timeout: 7000 });
    }
}

async function expectNoHorizontalOverlapIfVisible(leftLocator, rightLocator) {
    const isRightVisible = await rightLocator.isVisible().catch(() => false);
    if (!isRightVisible) return;
    await expectNoHorizontalOverlap(leftLocator, rightLocator);
}

async function expectNoHorizontalOverlap(leftLocator, rightLocator) {
    const leftBox = await leftLocator.boundingBox();
    const rightBox = await rightLocator.boundingBox();
    assert.ok(leftBox, 'left element should have a bounding box');
    assert.ok(rightBox, 'right element should have a bounding box');
    assert.ok(
        leftBox.x + leftBox.width <= rightBox.x || rightBox.x + rightBox.width <= leftBox.x,
        `Expected no overlap. Left=${JSON.stringify(leftBox)}, right=${JSON.stringify(rightBox)}`
    );
}

test('2 players can play while a third browser tab watches live as spectator', { concurrency: false }, async () => {
    logE2E('Verific Playwright și pornesc browserul Chromium...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    logE2E('Browserul Chromium a pornit.');

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const roomId = `e2e-${Date.now()}`;

        logE2E('Deschid 3 taburi: Player 1, Player 2 și Spectator...');
        const playerOne = await openRoomPage(context, app.baseUrl, roomId);
        logE2E('Player 1 conectat.');
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);
        logE2E('Player 2 conectat.');
        const spectator = await openRoomPage(context, app.baseUrl, roomId);
        logE2E('Al treilea tab conectat. Verific modul spectator...');

        await spectator.locator('body.spectator-active').waitFor({ timeout: 7000 });
        logE2E('Spectator confirmat.');
        await expectText(spectator.locator('#duelStatus'), /Spectator/);
        await assertElementHidden(playerOne.locator('#liveDuelBoard'));
        await assertElementHidden(playerTwo.locator('#liveDuelBoard'));

        logE2E('Hostul pornește runda pe Easy...');
        await startReadyDuelRound(playerOne, playerTwo, 'easy');

        logE2E('Aștept inițializarea jocului pentru playeri și spectator...');
        await playerOne.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await spectator.locator('#liveDuelBoard:not(.is-hidden)').waitFor({ timeout: 7000 });
        await assertElementHidden(spectator.locator('#grid'));

        logE2E('Player 1 trimite prima încercare...');
        const firstGuess = await pickFirstSuggestion(playerOne, 'Arvid');
        await spectator.locator('#liveDuelPlayers .live-guess-driver-name').filter({ hasText: firstGuess }).first().waitFor({ timeout: 7000 });
        logE2E(`Spectatorul vede încercarea Player 1: ${firstGuess}.`);
        await expectText(spectator.locator('#liveDuelSummary'), /1 încercări/);

        logE2E('Player 2 trimite a doua încercare...');
        const secondGuess = await pickFirstSuggestion(playerTwo, 'Andrea');
        await spectator.locator('#liveDuelPlayers .live-guess-driver-name').filter({ hasText: secondGuess }).first().waitFor({ timeout: 7000 });
        logE2E(`Spectatorul vede încercarea Player 2: ${secondGuess}.`);
        await expectText(spectator.locator('#liveDuelSummary'), /2 încercări/);

        await assertElementHidden(playerOne.locator('#liveDuelBoard'));
        await assertElementHidden(playerTwo.locator('#liveDuelBoard'));
        logE2E('Testul E2E s-a terminat cu succes.');
    } finally {
        logE2E('Închid browserul și serverul de test...');
        await browser.close();
        await app.stop();
    }
});


test('non-host correct guess is marked correct and spectator sees the live result', { concurrency: false }, async () => {
    logE2E('Verific E2E: Player 2 non-host ghicește corect și spectatorul vede rezultatul live...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const roomId = `nh${Date.now().toString(36)}`;
        const host = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);
        const spectator = await openRoomPage(context, app.baseUrl, roomId);

        await spectator.locator('body.spectator-active').waitFor({ timeout: 7000 });
        await startReadyDuelRound(host, playerTwo, 'easy');
        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await spectator.locator('#liveDuelBoard:not(.is-hidden)').waitFor({ timeout: 7000 });

        logE2E('Player 2 trimite răspunsul corect determinist: Arvid Lindblad...');
        const correctGuess = await pickFirstSuggestion(playerTwo, 'Arvid');
        assert.match(correctGuess, /Arvid Lindblad/i);

        const playerTwoFirstCell = playerTwo.locator('#cell-0-0');
        await expectText(playerTwoFirstCell, /Arvid Lindblad/i);
        await assertEventually(async () => {
            const className = await playerTwoFirstCell.getAttribute('class');
            assert.match(className || '', /green/, 'Player 2 should see the correct pilot cell as green');
        });
        await assertElementHidden(playerTwo.locator('#endGameDisplay'));

        const spectatorPlayerTwoCard = spectator.locator('#liveDuelPlayers .live-player-card').nth(1);
        await expectText(spectatorPlayerTwoCard.locator('.live-player-status'), /Terminat|Câștigător|În joc/i);
        await spectatorPlayerTwoCard.locator('.live-guess-driver-name').filter({ hasText: 'Arvid Lindblad' }).first().waitFor({ timeout: 7000 });
        await assertEventually(async () => {
            const correctPilotPillText = await spectatorPlayerTwoCard.locator('.live-guess-pill.green').allTextContents();
            assert.ok(
                correctPilotPillText.some(text => /Pilot\s*Arvid Lindblad/i.test(text.replace(/\s+/g, ' '))),
                `Spectator should see Player 2's correct pilot result as green. Got: ${correctPilotPillText.join(' | ')}`
            );
        });

        logE2E('Hostul termină cu încercări greșite pentru a declanșa rezultatul final al rundei...');
        await finishRoundWithWrongEasyGuesses(host, { waitForPopup: true });
        await playerTwo.locator('#endGameDisplay.show').waitFor({ timeout: 7000 });
        await expectText(playerTwo.locator('#endGameDisplay'), /AI CÂȘTIGAT|CÂȘTIGAT/i);
        await expectText(spectator.locator('#liveDuelSummary'), /a câștigat runda/i);
        await expectText(spectator.locator('#liveDuelSummary'), /Guest|Player|E2E|Host|a câștigat runda/i);
    } finally {
        await browser.close();
        await app.stop();
    }
});

async function expectText(locator, pattern) {
    await assertEventually(async () => {
        const text = await locator.textContent();
        assert.match(text || '', pattern);
    });
}

async function assertElementHidden(locator) {
    await assertEventually(async () => {
        const visible = await locator.isVisible();
        assert.equal(visible, false);
    });
}

async function assertEventually(assertion, timeoutMs = 7000) {
    const startedAt = Date.now();
    let lastError;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    throw lastError;
}


test('room round is restored after server restart', { concurrency: false }, async () => {
    logE2E('Verific Playwright pentru testul de persistență camere...');
    const { chromium } = requirePlaywright();
    const dataDir = path.join(os.tmpdir(), `f1guesser-e2e-persist-${process.pid}-${Date.now()}`);
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    const roomId = `p${Date.now().toString(36)}`;
    let app = null;

    try {
        app = await startAppServer({ dataDir });
        const firstContext = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const host = await openRoomPage(firstContext, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(firstContext, app.baseUrl, roomId);

        logE2E('Pornesc o rundă Easy care trebuie salvată pe disk...');
        await startReadyDuelRound(host, playerTwo, 'easy');
        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await sleep(300);
        await firstContext.close();
        await app.stop();
        app = null;

        logE2E('Repornesc serverul cu același DATA_DIR...');
        app = await startAppServer({ dataDir });
        const secondContext = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const rejoined = await openRoomPage(secondContext, app.baseUrl, roomId);

        logE2E('Verific dacă runda camerei a fost restaurată după restart...');
        await rejoined.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await expectText(rejoined.locator('#diff-display-label'), /Easy/i);
        await expectText(rejoined.locator('#duelStatus'), /Host|Player/i);
        await secondContext.close();
    } finally {
        await browser.close();
        if (app) await app.stop();
    }
});


test('auth register login logout refreshes room member name while staying in the room', { concurrency: false }, async () => {
    logE2E('Verific fluxul E2E de auth + socket refresh în cameră...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const roomId = `a${Date.now().toString(36)}`;
        const username = `E2E_${Date.now().toString(36).slice(-6)}`;
        const credentials = {
            username,
            email: `${username.toLowerCase()}@example.test`,
            password: 'TestPass123!'
        };

        const host = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);
        const spectator = await openRoomPage(context, app.baseUrl, roomId);
        await spectator.locator('body.spectator-active').waitFor({ timeout: 7000 });

        await startReadyDuelRound(host, playerTwo, 'easy');
        await spectator.locator('#liveDuelBoard:not(.is-hidden)').waitFor({ timeout: 7000 });

        await registerViaUi(host, credentials);
        await spectator.locator('#liveDuelPlayers .live-player-name').filter({ hasText: username }).first().waitFor({ timeout: 7000 });

        await logoutViaUi(host);
        await assertEventually(async () => {
            const names = await spectator.locator('#liveDuelPlayers .live-player-name').allTextContents();
            assert.equal(names.includes(username), false);
            assert.ok(names.some(name => /Guest/i.test(name)), `Expected a Guest name after logout, got: ${names.join(', ')}`);
        });

        await loginViaUi(host, credentials);
        await spectator.locator('#liveDuelPlayers .live-player-name').filter({ hasText: username }).first().waitFor({ timeout: 7000 });
        await playerTwo.close();
    } finally {
        await browser.close();
        await app.stop();
    }
});


test('host can start a rematch after a round ends', { concurrency: false }, async () => {
    logE2E('Verific fluxul E2E de rematch...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const roomId = `r${Date.now().toString(36)}`;
        const host = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);

        await startReadyDuelRound(host, playerTwo, 'easy');
        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });

        await finishRoundByGuessing(host, { waitForPopup: false });
        await finishRoundByGuessing(playerTwo, { waitForPopup: true });
        await host.locator('#endGameDisplay.show').waitFor({ timeout: 7000 });
        await playerTwo.locator('#endGameDisplay.show').waitFor({ timeout: 7000 });
        await host.locator('#restartGameBtn').click();
        await playerTwo.locator('#closeEndGamePopup').click();

        await host.locator('#duelLobbyPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await playerTwo.locator('#duelLobbyPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await startReadyDuelRound(host, playerTwo, 'easy');

        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await expectText(host.locator('#status'), /Ghicește noul pilot misterios|Ghicește pilotul misterios/i);
    } finally {
        await browser.close();
        await app.stop();
    }
});



test('single play starts without room state and rematch stays in single mode', { concurrency: false }, async () => {
    logE2E('Verific flow-ul E2E pentru Single Play fără cameră...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const page = await openAppPage(context, app.baseUrl);

        await page.locator('body.mode-single').waitFor({ timeout: 7000 });
        await assertElementHidden(page.locator('#shareRoomBtn'));
        await assertElementHidden(page.locator('#duelStatus'));
        await assertElementHidden(page.locator('#dailyChallengePanel'));
        await assertElementHidden(page.locator('#liveDuelBoard'));

        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await page.locator('body.mode-single').waitFor({ timeout: 7000 });
        await expectText(page.locator('#diff-display-label'), /Single Play · Mod: easy/i);
        await expectText(page.locator('#status'), /Single Play/i);
        await assertElementHidden(page.locator('#shareRoomBtn'));
        await assertElementHidden(page.locator('#liveDuelBoard'));

        await finishRoundByGuessing(page);
        await page.locator('#endGameDisplay.show').waitFor({ timeout: 7000 });
        await page.locator('#restartGameBtn').click();
        await page.locator('#endGameDisplay').waitFor({ state: 'hidden', timeout: 7000 });
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await page.locator('body.mode-single').waitFor({ timeout: 7000 });
        await expectText(page.locator('#diff-display-label'), /Single Play · Mod: easy/i);
        await assertElementHidden(page.locator('#shareRoomBtn'));
        await context.close();
    } finally {
        await browser.close();
        await app.stop();
    }
});


test('daily challenge panel is isolated from single and duel modes', { concurrency: false }, async () => {
    logE2E('Verific flow-ul E2E pentru Daily Challenge separat de Single/Duel...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });

    try {
        const context = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const page = await openAppPage(context, app.baseUrl);

        await page.locator('body.mode-single').waitFor({ timeout: 7000 });
        await assertElementHidden(page.locator('#dailyChallengePanel'));
        await page.locator('[data-game-mode-choice="daily"]').click();
        await page.locator('body.mode-daily').waitFor({ timeout: 7000 });
        await page.locator('#dailyChallengePanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await assertElementHidden(page.locator('#difficultySection'));
        await assertElementHidden(page.locator('#shareRoomBtn'));
        await assertElementHidden(page.locator('#duelStatus'));

        await page.locator('#dailyChallengePanel [data-daily-level="easy"]:disabled')
            .waitFor({ state: 'visible', timeout: 7000 });
        await expectText(page.locator('#dailyResetInfo'), /Autentifică-te/i);
        const dailySuffix = Date.now().toString(36).slice(-8);
        await registerViaUi(page, {
            username: `Daily_${dailySuffix}`,
            email: `daily-${dailySuffix}@example.test`,
            password: 'TestPass123!'
        });

        await page.locator('#dailyChallengePanel [data-daily-level="easy"]:not(:disabled)')
            .click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await page.locator('body.mode-daily').waitFor({ timeout: 7000 });
        await expectText(page.locator('#diff-display-label'), /Daily Challenge · Mod: easy/i);
        await expectText(page.locator('#status'), /Daily Challenge/i);
        await assertElementHidden(page.locator('#shareRoomBtn'));
        await assertElementHidden(page.locator('#liveDuelBoard'));

        await pickFirstSuggestion(page, 'Arvid');
        await page.locator('#grid .cell').first().waitFor({ state: 'visible', timeout: 7000 });

        const secondPage = await openAppPage(context, app.baseUrl);
        await secondPage.locator('[data-game-mode-choice="daily"]').click();
        await secondPage.locator('body.mode-daily').waitFor({ timeout: 7000 });
        await secondPage.locator('#dailyChallengePanel [data-daily-level="easy"]:disabled')
            .waitFor({ state: 'visible', timeout: 7000 });
        await secondPage.locator('[data-game-mode-choice="single"]').click();
        await secondPage.locator('body.mode-single').waitFor({ timeout: 7000 });
        await assertElementHidden(secondPage.locator('#dailyChallengePanel'));
        await secondPage.locator('[data-game-mode-choice="duel"]').click();
        await secondPage.locator('body.mode-duel').waitFor({ timeout: 7000 });
        await assertElementHidden(secondPage.locator('#dailyChallengePanel'));
        await secondPage.close();
        await context.close();
    } finally {
        await browser.close();
        await app.stop();
    }
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
