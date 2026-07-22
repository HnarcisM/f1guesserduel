const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    logE2E,
    openAppPage,
    requirePlaywright,
    startAppServer
} = require('./e2eTestHarness');

async function expectText(locator, pattern, timeoutMs = 7000) {
    await locator.filter({ hasText: pattern }).waitFor({ state: 'visible', timeout: timeoutMs });
}

async function openAuthPanel(page) {
    const panel = page.locator('#authPanel');
    const isOpen = await panel.evaluate(element => element.classList.contains('show'));
    if (!isOpen) await page.locator('#authOpenBtn').click();
    await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
}

async function registerAccount(page, credentials) {
    await openAuthPanel(page);
    const registerMode = await page.locator('#authSubmitBtn').textContent();
    if (!/Creează cont/i.test(registerMode || '')) {
        await page.locator('#authSwitchBtn').click();
    }

    await page.locator('#authUsername').fill(credentials.username);
    await page.locator('#authEmail').fill(credentials.email);
    await page.locator('#authPassword').fill(credentials.password);
    await page.locator('#authForm').evaluate(form => form.requestSubmit());

    await expectText(page.locator('#authOpenBtn'), new RegExp(credentials.username));
    await page.locator('#authPanel').waitFor({ state: 'hidden', timeout: 7000 });
}

test('authenticated profile settings persist username and avatar after reload', { concurrency: false }, async () => {
    logE2E('Verific profilul autentificat, setările și persistența după reload...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    let browser;

    const suffix = Date.now().toString(36).slice(-8);
    const credentials = {
        username: `E2E_${suffix}`,
        email: `e2e-${suffix}@example.test`,
        password: 'TestPass123!'
    };
    const updatedUsername = `Pilot_${suffix}`;

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
        const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const page = await openAppPage(context, app.baseUrl);
        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });

        await registerAccount(page, credentials);
        await openAuthPanel(page);
        await page.locator('#authAccountView:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await expectText(page.locator('#authAccountUsername'), new RegExp(credentials.username));
        await expectText(page.locator('#authAccountEmail'), new RegExp(credentials.email));

        await page.locator('#authTabSettings').click();
        await page.locator('#authPanelSettings:not([hidden])').waitFor({ state: 'visible', timeout: 7000 });

        const avatarSettings = page.locator('details.auth-avatar-settings');
        await avatarSettings.locator('summary').click();
        await page.locator('#authAvatarHelmetBlue').click();
        await page.locator('#authSaveAvatarBtn:not(:disabled)').click();
        await expectText(page.locator('#authSettingsMessage'), /Avatarul a fost actualizat/i);
        assert.equal(await page.locator('#authAccountAvatar').getAttribute('data-avatar-key'), 'helmet-blue');

        const usernameSettings = page.locator('details.auth-settings-disclosure').filter({
            hasText: 'Schimbă username-ul'
        });
        await usernameSettings.locator('summary').click();
        await page.locator('#authSettingsUsername').fill(updatedUsername);
        await page.locator('#authUsernameCurrentPassword').fill(credentials.password);
        await page.locator('#authUsernameSettingsForm').evaluate(form => form.requestSubmit());
        await expectText(page.locator('#authSettingsMessage'), /Username-ul a fost actualizat/i);
        await expectText(page.locator('#authOpenBtn'), new RegExp(updatedUsername));
        await expectText(page.locator('#authUsernameCooldownHint'), /Următoarea schimbare este disponibilă/i);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expectText(page.locator('#authOpenBtn'), new RegExp(updatedUsername));
        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await openAuthPanel(page);
        await page.locator('#authAccountView:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await expectText(page.locator('#authAccountUsername'), new RegExp(updatedUsername));
        await expectText(page.locator('#authAccountEmail'), new RegExp(credentials.email));
        assert.equal(await page.locator('#authAccountAvatar').getAttribute('data-avatar-key'), 'helmet-blue');

        await context.close();
    } finally {
        if (browser) await browser.close();
        await app.stop();
        fs.rmSync(app.dataDir, { recursive: true, force: true });
    }
});
