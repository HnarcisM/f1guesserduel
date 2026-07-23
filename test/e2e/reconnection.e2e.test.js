const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    logE2E,
    openRoomPage,
    requirePlaywright,
    stabilizePage,
    startAppServer
} = require('./e2eTestHarness');
const { startReadyDuelRound } = require('./duelReadyE2eHelpers');

const ROOM_CLIENT_ID_STORAGE_KEY = 'f1guesserduel.tabClientId';

async function expectText(locator, pattern, timeoutMs = 7000) {
    await locator.filter({ hasText: pattern }).waitFor({ state: 'visible', timeout: timeoutMs });
}

async function submitSuggestion(page, query) {
    await page.locator('#driverInput').fill(query);
    const suggestion = page.locator('#suggestions li').first();
    await suggestion.waitFor({ state: 'visible', timeout: 5000 });
    const selectedName = (await suggestion.textContent() || '').trim();
    await suggestion.click();
    return selectedName;
}

test('duel refresh preserves participant identity, role and previous guesses', { concurrency: false }, async () => {
    logE2E('Verific reconectarea Duel după refresh și restaurarea progresului...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    let browser;

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
        const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const roomId = `re${Date.now().toString(36)}`;
        const host = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);

        await startReadyDuelRound(host, playerTwo, 'easy');
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await expectText(host.locator('#duelStatus'), /Jucători:\s*2\/2.*Host/i);

        const clientIdBeforeReload = await host.evaluate(storageKey => {
            return sessionStorage.getItem(storageKey);
        }, ROOM_CLIENT_ID_STORAGE_KEY);
        assert.match(clientIdBeforeReload || '', /^[a-zA-Z0-9_-]+$/);

        const firstGuess = await submitSuggestion(host, 'Andrea');
        await expectText(host.locator('#cell-0-0'), new RegExp(firstGuess));

        await host.reload({ waitUntil: 'domcontentloaded' });
        await stabilizePage(host);
        await host.locator('body.mode-duel').waitFor({ timeout: 7000 });
        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });

        const clientIdAfterReload = await host.evaluate(storageKey => {
            return sessionStorage.getItem(storageKey);
        }, ROOM_CLIENT_ID_STORAGE_KEY);
        assert.equal(clientIdAfterReload, clientIdBeforeReload);
        await expectText(host.locator('#duelStatus'), /Jucători:\s*2\/2.*Host/i);
        await expectText(host.locator('#cell-0-0'), new RegExp(firstGuess));
        assert.doesNotMatch((await host.locator('#duelStatus').textContent()) || '', /Spectatori/i);

        const secondGuess = await submitSuggestion(host, 'Gabriel');
        await expectText(host.locator('#cell-1-0'), new RegExp(secondGuess));
        await expectText(playerTwo.locator('#duelStatus'), /Jucători:\s*2\/2/i);

        await context.close();
    } finally {
        if (browser) await browser.close();
        await app.stop();
        fs.rmSync(app.dataDir, { recursive: true, force: true });
    }
});
