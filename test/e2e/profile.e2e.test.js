const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    logE2E,
    openAppPage,
    requirePlaywright,
    startAppServer
} = require('./e2eTestHarness');

const PROFILE_VIEWPORTS = Object.freeze([
    Object.freeze({ label: 'phone-360', width: 360, height: 800 }),
    Object.freeze({ label: 'fold5-cover', width: 344, height: 882 }),
    Object.freeze({ label: 'fold5-inner-portrait', width: 704, height: 842 }),
    Object.freeze({ label: 'fold5-inner-landscape', width: 842, height: 704 }),
    Object.freeze({ label: 'laptop-1366', width: 1366, height: 768 }),
    Object.freeze({ label: 'desktop', width: 1440, height: 900 })
]);

async function expectText(locator, pattern, timeoutMs = 7000) {
    await locator.filter({ hasText: pattern }).waitFor({ state: 'visible', timeout: timeoutMs });
}

async function openAuthPanel(page) {
    const panel = page.locator('#authPanel');
    const isOpen = await panel.evaluate(element => element.classList.contains('show'));
    if (!isOpen) await page.locator('#authOpenBtn').click();
    await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
}

async function collectProfileViewportMetrics(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('#authPanel');
        const closeButton = document.querySelector('#authCloseBtn');
        const header = document.querySelector('.site-header');
        const panelRect = panel.getBoundingClientRect();
        const closeRect = closeButton.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const closeStyle = getComputedStyle(closeButton);
        const hitTarget = document.elementFromPoint(
            closeRect.left + (closeRect.width / 2),
            closeRect.top + (closeRect.height / 2)
        );

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: Math.max(
                document.documentElement.scrollWidth,
                document.body.scrollWidth
            ),
            panel: {
                top: panelRect.top,
                right: panelRect.right,
                bottom: panelRect.bottom,
                left: panelRect.left,
                clientHeight: panel.clientHeight,
                scrollHeight: panel.scrollHeight,
                scrollTop: panel.scrollTop
            },
            closeButton: {
                top: closeRect.top,
                right: closeRect.right,
                bottom: closeRect.bottom,
                left: closeRect.left,
                visible: closeStyle.display !== 'none'
                    && closeStyle.visibility !== 'hidden'
                    && Number.parseFloat(closeStyle.opacity || '1') > 0
                    && closeRect.width > 0
                    && closeRect.height > 0,
                isTopHitTarget: closeButton === hitTarget || closeButton.contains(hitTarget)
            },
            headerBottom: headerRect.bottom
        };
    });
}

function assertProfileFitsViewport(metrics, label) {
    const tolerance = 1;
    const edgeGap = 8;

    assert.ok(
        metrics.documentWidth <= metrics.viewport.width + tolerance,
        `${label}: pagina are overflow orizontal (${metrics.documentWidth}px > ${metrics.viewport.width}px)`
    );
    assert.ok(metrics.panel.left >= -tolerance, `${label}: profilul depășește marginea stângă`);
    assert.ok(
        metrics.panel.right <= metrics.viewport.width + tolerance,
        `${label}: profilul depășește marginea dreaptă`
    );
    assert.ok(
        metrics.panel.top >= metrics.headerBottom + edgeGap,
        `${label}: profilul se suprapune peste header`
    );
    assert.ok(
        metrics.panel.bottom <= metrics.viewport.height - edgeGap + tolerance,
        `${label}: profilul depășește partea de jos a viewport-ului`
    );
    assert.equal(metrics.closeButton.visible, true, `${label}: butonul de închidere nu este vizibil`);
    assert.ok(
        metrics.closeButton.top >= metrics.panel.top - tolerance
            && metrics.closeButton.bottom <= metrics.panel.bottom + tolerance,
        `${label}: butonul de închidere nu rămâne în interiorul profilului`
    );
    assert.equal(
        metrics.closeButton.isTopHitTarget,
        true,
        `${label}: butonul de închidere este acoperit de alt element`
    );

    if (metrics.panel.scrollHeight > metrics.panel.clientHeight + tolerance) {
        assert.ok(metrics.panel.scrollTop > 0, `${label}: profilul nu a putut fi derulat`);
    }
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

test('profile modal stays inside responsive viewports and keeps close control reachable after scroll', { concurrency: false }, async () => {
    logE2E(`Verific profilul în ${PROFILE_VIEWPORTS.length} viewport-uri responsive...`);
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    let browser;

    const suffix = Date.now().toString(36).slice(-8);
    const credentials = {
        username: `Viewport_${suffix}`,
        email: `viewport-${suffix}@example.test`,
        password: 'TestPass123!'
    };

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
        const initialViewport = PROFILE_VIEWPORTS[0];
        const context = await browser.newContext({
            viewport: { width: initialViewport.width, height: initialViewport.height }
        });
        const page = await openAppPage(context, app.baseUrl);
        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });

        await registerAccount(page, credentials);
        await openAuthPanel(page);
        await page.locator('#authAccountView:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await page.locator('#authTabSettings').click();
        await page.locator('#authPanelSettings:not([hidden])').waitFor({ state: 'visible', timeout: 7000 });

        const avatarSettings = page.locator('details.auth-avatar-settings');
        if (await avatarSettings.getAttribute('open') === null) await avatarSettings.locator('summary').click();
        const usernameSettings = page.locator('details.auth-settings-disclosure').filter({
            hasText: 'Schimbă username-ul'
        });
        if (await usernameSettings.getAttribute('open') === null) await usernameSettings.locator('summary').click();

        for (const viewport of PROFILE_VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
            await page.locator('#authPanel').evaluate(panel => {
                panel.scrollTop = panel.scrollHeight;
            });

            const metrics = await collectProfileViewportMetrics(page);
            assert.deepEqual(metrics.viewport, { width: viewport.width, height: viewport.height });
            assertProfileFitsViewport(metrics, viewport.label);
            await page.locator('#authCloseBtn').click({ trial: true });
        }

        await page.locator('#authCloseBtn').click();
        await page.locator('#authPanel').waitFor({ state: 'hidden', timeout: 7000 });
        await context.close();
    } finally {
        if (browser) await browser.close();
        await app.stop();
        fs.rmSync(app.dataDir, { recursive: true, force: true });
    }
});
