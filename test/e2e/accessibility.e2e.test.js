const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    logE2E,
    openAppPage,
    openRoomPage,
    requirePlaywright,
    startAppServer
} = require('./e2eTestHarness');

const AXE_SOURCE = require('axe-core').source;
const THEMES = Object.freeze(['default', 'neon', 'carbon']);
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'test-results', 'accessibility');
const REPORT_PATH = path.join(OUTPUT_DIR, 'axe-report.json');

function summarizeViolation(stateLabel, violation) {
    const targets = violation.nodes
        .flatMap(node => node.target || [])
        .map(target => String(target))
        .join(', ');
    return `${stateLabel}: [${violation.impact || 'unknown'}] ${violation.id} - ${violation.help}; targets: ${targets}`;
}

async function auditPageState(page, stateLabel) {
    const result = await page.evaluate(async () => {
        return globalThis.axe.run(document, {
            resultTypes: ['violations', 'incomplete']
        });
    });

    logE2E(`Audit axe ${stateLabel}: ${result.violations.length} încălcări, ${result.incomplete.length} verificări manuale.`);
    return {
        state: stateLabel,
        testEngine: result.testEngine,
        testEnvironment: result.testEnvironment,
        timestamp: result.timestamp,
        url: result.url,
        violations: result.violations,
        incomplete: result.incomplete
    };
}

async function auditPageThemes(page, stateLabel) {
    const reports = [];
    for (const theme of THEMES) {
        await page.evaluate(selectedTheme => {
            document.documentElement.setAttribute('data-app-theme', selectedTheme);
        }, theme);
        reports.push(await auditPageState(page, `${stateLabel}/${theme}`));
    }
    return reports;
}

function writeReport(states) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
        REPORT_PATH,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), states }, null, 2)}\n`,
        'utf8'
    );
}

async function submitFirstSuggestion(page, query) {
    await page.locator('#driverInput').fill(query);
    const suggestion = page.locator('#suggestions li').first();
    await suggestion.waitFor({ state: 'visible', timeout: 5000 });
    await suggestion.click();
}

async function registerAccount(page) {
    const suffix = Date.now().toString(36).slice(-8);
    const credentials = {
        username: `A11y_${suffix}`,
        email: `a11y-${suffix}@example.test`,
        password: 'TestPass123!'
    };

    await page.locator('#authUsername').fill(credentials.username);
    await page.locator('#authEmail').fill(credentials.email);
    await page.locator('#authPassword').fill(credentials.password);
    await page.locator('#authForm').evaluate(form => form.requestSubmit());
    await page.locator('#authPanel').waitFor({ state: 'hidden', timeout: 7000 });
    await page.locator('#authOpenBtn').filter({ hasText: credentials.username })
        .waitFor({ state: 'visible', timeout: 7000 });
}

async function auditAuthenticatedProfile(page, reports) {
    await page.locator('#authOpenBtn').click();
    await page.locator('#authAccountView:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });

    const tabs = [
        ['#authTabOverview', '#authPanelOverview:not([hidden])', 'profile-overview'],
        ['#authTabAchievements', '#authPanelAchievements:not([hidden])', 'profile-achievements'],
        ['#authTabStats', '#authPanelStats:not([hidden])', 'profile-stats'],
        ['#authTabHistory', '#authPanelHistory:not([hidden])', 'profile-history'],
        ['#authTabSettings', '#authPanelSettings:not([hidden])', 'profile-settings']
    ];

    for (const [tabSelector, panelSelector, stateLabel] of tabs) {
        await page.locator(tabSelector).click();
        await page.locator(panelSelector).waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, stateLabel));
    }

    const settingsCards = page.locator('#authPanelSettings details.auth-settings-disclosure');
    for (let index = 0; index < await settingsCards.count(); index += 1) {
        const card = settingsCards.nth(index);
        if (!await card.getAttribute('open')) await card.locator('summary').click();
    }
    reports.push(...await auditPageThemes(page, 'profile-settings-expanded'));
}

test('axe finds no accessibility violations across application screens and states', { concurrency: false }, async () => {
    logE2E('Pornesc auditul extins de accesibilitate axe...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    let browser;
    const reports = [];

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
        const context = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            colorScheme: 'dark',
            reducedMotion: 'reduce'
        });
        await context.addInitScript({ content: AXE_SOURCE });
        let page = await openAppPage(context, app.baseUrl);

        await page.locator('#difficulty-overlay').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'home'));

        await page.locator('[data-game-mode-choice="daily"]').click();
        await page.locator('#dailyChallengePanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'daily-selection'));

        await page.locator('#dailyChallengePanel [data-daily-level="easy"]').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'daily-game'));

        await page.close();
        page = await openAppPage(context, app.baseUrl);

        await page.locator('[data-game-mode-choice="duel"]').click();
        await page.locator('#duelRoomBrowserPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'duel-browser'));

        await page.close();
        const roomId = `a11y${Date.now().toString(36)}`;
        const host = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);
        const spectator = await openRoomPage(context, app.baseUrl, roomId);

        await host.locator('#duelLobbyPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await spectator.locator('body.spectator-active').waitFor({ timeout: 7000 });
        reports.push(...await auditPageThemes(host, 'duel-lobby'));

        await host.locator('#duelLobbyStartBtn:not(:disabled)').click();
        await host.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        await spectator.locator('#liveDuelBoard:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(host, 'duel-game-player'));
        reports.push(...await auditPageThemes(spectator, 'duel-game-spectator'));

        await submitFirstSuggestion(playerTwo, 'Arvid');
        await playerTwo.locator('#cell-0-0').waitFor({ state: 'visible', timeout: 7000 });
        await submitFirstSuggestion(host, 'Arvid');
        await host.locator('#endGameDisplay.show').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(host, 'duel-result-dialog'));

        await host.close();
        await playerTwo.close();
        await spectator.close();
        page = await openAppPage(context, app.baseUrl);
        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'single-game'));

        await page.locator('#menu-hamburger').click();
        await page.locator('#dropdown-menu:not(.hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'navigation-menu'));
        await page.locator('#menu-hamburger').click();

        await page.locator('#authOpenBtn').click();
        await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'auth-login'));

        await page.locator('#authSwitchBtn').click();
        await page.locator('#authUsername').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'auth-register'));

        await registerAccount(page);
        await auditAuthenticatedProfile(page, reports);
        await context.close();
    } finally {
        writeReport(reports);
        if (browser) await browser.close();
        await app.stop();
        fs.rmSync(app.dataDir, { recursive: true, force: true });
    }

    const violations = reports.flatMap(report => (
        report.violations.map(violation => summarizeViolation(report.state, violation))
    ));
    assert.deepEqual(violations, [], `axe accessibility violations:\n${violations.join('\n')}`);
});
