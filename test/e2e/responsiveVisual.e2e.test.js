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
const {
    DEFAULT_CHANNEL_THRESHOLD,
    DEFAULT_MAX_DIFF_RATIO,
    comparePngBuffers,
    writeDiffPng
} = require('./visualRegression');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'test-results', 'responsive-visual');
const BASELINE_DIR = path.join(__dirname, 'baselines', 'responsive-visual');
const UPDATE_BASELINES = process.env.UPDATE_VISUAL_BASELINES === '1';

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
    for (const fileName of fs.readdirSync(OUTPUT_DIR)) {
        if (fileName.endsWith('.diff.png')) {
            fs.rmSync(path.join(OUTPUT_DIR, fileName));
        }
    }
    if (UPDATE_BASELINES) fs.mkdirSync(BASELINE_DIR, { recursive: true });
}

async function compareWithBaseline(fileName, screenshot) {
    const baselinePath = path.join(BASELINE_DIR, fileName);
    const diffFileName = fileName.replace(/\.png$/i, '.diff.png');
    const diffPath = path.join(OUTPUT_DIR, diffFileName);

    if (UPDATE_BASELINES) {
        fs.writeFileSync(baselinePath, screenshot);
        return {
            status: 'updated',
            baseline: path.relative(process.cwd(), baselinePath).replace(/\\/g, '/'),
            diffRatio: 0,
            differentPixels: 0
        };
    }

    assert.ok(
        fs.existsSync(baselinePath),
        `${fileName}: lipsește baseline-ul. Rulează cu UPDATE_VISUAL_BASELINES=1 pentru a-l genera.`
    );

    const baseline = fs.readFileSync(baselinePath);
    const comparison = await comparePngBuffers(baseline, screenshot, {
        channelThreshold: DEFAULT_CHANNEL_THRESHOLD
    });

    assert.deepEqual(
        comparison.currentSize,
        comparison.baselineSize,
        `${fileName}: dimensiunea capturii diferă de baseline`
    );

    if (comparison.diffRatio > DEFAULT_MAX_DIFF_RATIO) {
        await writeDiffPng(comparison, diffPath);
    }

    assert.ok(
        comparison.diffRatio <= DEFAULT_MAX_DIFF_RATIO,
        `${fileName}: diferență vizuală ${(comparison.diffRatio * 100).toFixed(3)}% `
            + `> ${(DEFAULT_MAX_DIFF_RATIO * 100).toFixed(3)}%; diff: ${diffPath}`
    );

    return {
        status: 'matched',
        baseline: path.relative(process.cwd(), baselinePath).replace(/\\/g, '/'),
        channelThreshold: DEFAULT_CHANNEL_THRESHOLD,
        maxDiffRatio: DEFAULT_MAX_DIFF_RATIO,
        diffRatio: comparison.diffRatio,
        differentPixels: comparison.differentPixels,
        totalPixels: comparison.totalPixels
    };
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

        const describeElement = element => {
            const id = element.id ? `#${element.id}` : '';
            const className = typeof element.className === 'string'
                ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(name => `.${name}`).join('')
                : '';
            return `${element.tagName.toLowerCase()}${id}${className}`;
        };
        const overflowCandidates = Array.from(document.body.querySelectorAll('*'))
            .map(element => {
                const rectangle = element.getBoundingClientRect();
                return {
                    element: describeElement(element),
                    left: Math.round(rectangle.left),
                    right: Math.round(rectangle.right),
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth
                };
            })
            .filter(item => item.left < -tolerance
                || item.right > window.innerWidth + tolerance
                || item.scrollWidth > item.clientWidth + tolerance)
            .slice(0, 12);

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outsideViewport,
            overflowCandidates,
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
        `${prefix}: body overflow ${layout.bodyWidth}px > ${layout.viewport.width}px; candidates=${JSON.stringify(layout.overflowCandidates)}`
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
    const visualRegression = await compareWithBaseline(fileName, screenshot);

    const layout = await collectLayout(page, selectors);
    assertLayoutFits(layout, viewport.label, stateLabel);
    return { screenshot: fileName, visualRegression, layout };
}

test('responsive layouts match committed visual baselines', { concurrency: false }, async () => {
    ensureOutputDirectory();
    logE2E(`Verific responsive + capturi vizuale pentru ${VIEWPORTS.length} viewport-uri...`);
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const report = [];
    let browser;

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
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
