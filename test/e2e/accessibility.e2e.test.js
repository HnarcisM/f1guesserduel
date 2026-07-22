const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    logE2E,
    openAppPage,
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

test('axe finds no accessibility violations in the primary application states', { concurrency: false }, async () => {
    logE2E('Pornesc auditul automat de accesibilitate axe...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({
        headless: process.env.E2E_HEADED !== '1',
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    const reports = [];

    try {
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

        await page.locator('[data-game-mode-choice="duel"]').click();
        await page.locator('#duelRoomBrowserPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'duel-browser'));

        await page.close();
        page = await openAppPage(context, app.baseUrl);
        await page.locator('.btn-diff.easy').click();
        await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'single-game'));

        await page.locator('#authOpenBtn').click();
        await page.locator('#authPanel.show').waitFor({ state: 'visible', timeout: 7000 });
        reports.push(...await auditPageThemes(page, 'auth-login'));
    } finally {
        writeReport(reports);
        await browser.close();
        await app.stop();
    }

    const violations = reports.flatMap(report => (
        report.violations.map(violation => summarizeViolation(report.state, violation))
    ));
    assert.deepEqual(violations, [], `axe accessibility violations:\n${violations.join('\n')}`);
});
