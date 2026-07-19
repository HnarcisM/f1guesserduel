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
const { VIEWPORTS } = require('./responsiveVisualConfig');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'test-results', 'responsive-visual');

const HOME_SELECTORS = Object.freeze([
    '.site-header',
    '.site-header h1',
    '#menu-hamburger',
    '#authOpenBtn',
    '.menu-container',
    '.game-mode-selection',
    '#difficultySection'
]);

const GAME_SELECTORS = Object.freeze([
    '.site-header',
    '.container',
    '#status',
    '#diff-display-label',
    '#gameZone',
    '#driverInput',
    '#sendGuessBtn',
    '#grid',
    '.site-footer'
]);

function ensureOutputDirectory() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function collectLayout(page, selectors) {
    return page.evaluate(selectorList => {
        const tolerance = 2;
        const elements = selectorList.map(selector => {
            const element = document.querySelector(selector);
            if (!element) return { selector, exists: false, visible: false };

            const style = getComputedStyle(element);
            const rectangle = element.getBoundingClientRect();
            const visible = style.display !== 'none'
                && style.visibility !== 'hidden'
                && rectangle.width > 0
                && rectangle.height > 0;

            return {
                selector,
                exists: true,
                visible,
                rectangle: visible ? {
                    left: Math.round(rectangle.left * 100) / 100,
                    right: Math.round(rectangle.right * 100) / 100,
                    top: Math.round(rectangle.top * 100) / 100,
                    bottom: Math.round(rectangle.bottom * 100) / 100,
                    width: Math.round(rectangle.width * 100) / 100,
                    height: Math.round(rectangle.height * 100) / 100
                } : null
            };
        });

        const visibleElements = elements.filter(element => element.visible);
        const outsideViewport = visibleElements
            .filter(element => element.rectangle.left < -tolerance
                || element.rectangle.right > window.innerWidth + tolerance)
            .map(element => element.selector);

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outsideViewport,
            elements
        };
    }, selectors);
}

function assertLayoutFits(layout, viewportLabel, stateLabel) {
    const prefix = `${viewportLabel}/${stateLabel}`;
    assert.ok(
        layout.documentWidth <= layout.viewport.width + 2,
        `${prefix}: document overflow ${layout.documentWidth}px > ${layout.viewport.width}px`
    );
    assert.ok(
        layout.bodyWidth <= layout.viewport.width + 2,
        `${prefix}: body overflow ${layout.bodyWidth}px > ${layout.viewport.width}px`
    );
    assert.deepEqual(
        layout.outsideViewport,
        [],
        `${prefix}: elemente ieșite lateral din viewport: ${layout.outsideViewport.join(', ')}`
    );

    for (const element of layout.elements) {
        assert.ok(element.exists, `${prefix}: lipsește elementul ${element.selector}`);
        assert.ok(element.visible, `${prefix}: elementul ${element.selector} nu este vizibil`);
    }
}

async function assertNoVisibleOverlap(page, firstSelector, secondSelector, label) {
    const overlap = await page.evaluate(([first, second]) => {
        const firstElement = document.querySelector(first);
        const secondElement = document.querySelector(second);
        if (!firstElement || !secondElement) return false;

        const firstRect = firstElement.getBoundingClientRect();
        const secondRect = secondElement.getBoundingClientRect();
        const firstVisible = firstRect.width > 0 && firstRect.height > 0;
        const secondVisible = secondRect.width > 0 && secondRect.height > 0;
        if (!firstVisible || !secondVisible) return false;

        return !(
            firstRect.right <= secondRect.left
            || secondRect.right <= firstRect.left
            || firstRect.bottom <= secondRect.top
            || secondRect.bottom <= firstRect.top
        );
    }, [firstSelector, secondSelector]);

    assert.equal(overlap, false, `${label}: ${firstSelector} se suprapune cu ${secondSelector}`);
}

async function captureState(page, viewport, stateLabel, selectors) {
    const fileName = `${viewport.label}-${stateLabel}.png`;
    const screenshotPath = path.join(OUTPUT_DIR, fileName);
    const screenshot = await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: 'disabled'
    });
    assert.ok(screenshot.length > 10_000, `${fileName}: captura PNG pare incompletă`);

    const layout = await collectLayout(page, selectors);
    assertLayoutFits(layout, viewport.label, stateLabel);
    return { screenshot: fileName, layout };
}

test('responsive and visual smoke coverage for home and game layouts', { concurrency: false }, async () => {
    ensureOutputDirectory();
    logE2E(`Verific responsive + capturi vizuale pentru ${VIEWPORTS.length} viewport-uri...`);
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const report = [];
    let browser;

    try {
        browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
        for (const viewport of VIEWPORTS) {
            const context = await browser.newContext({
                viewport: { width: viewport.width, height: viewport.height },
                colorScheme: 'dark',
                reducedMotion: 'reduce'
            });

            try {
                const page = await openAppPage(context, app.baseUrl);
                await page.locator('#difficulty-overlay').waitFor({ state: 'visible', timeout: 7000 });
                const home = await captureState(page, viewport, 'home', HOME_SELECTORS);
                await assertNoVisibleOverlap(page, '.site-header h1', '#menu-hamburger', `${viewport.label}/home`);
                await assertNoVisibleOverlap(page, '.site-header h1', '#authOpenBtn', `${viewport.label}/home`);

                await page.locator('.btn-diff.easy').click();
                await page.locator('#gameZone:not(.game-zone-hidden)').waitFor({ state: 'visible', timeout: 7000 });
                await page.locator('body.mode-single').waitFor({ timeout: 7000 });
                const game = await captureState(page, viewport, 'game', GAME_SELECTORS);
                await assertNoVisibleOverlap(page, '#driverInput', '#sendGuessBtn', `${viewport.label}/game`);

                report.push({ viewport, states: { home, game } });
            } finally {
                await context.close();
            }
        }
    } finally {
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'layout-report.json'),
            `${JSON.stringify({ generatedAt: new Date().toISOString(), viewports: report }, null, 2)}\n`,
            'utf8'
        );
        try {
            if (browser) await browser.close();
        } finally {
            await app.stop();
        }
    }
});
