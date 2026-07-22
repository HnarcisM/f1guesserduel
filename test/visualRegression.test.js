const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const sharp = require('sharp');

const { VIEWPORTS } = require('./e2e/responsiveVisualConfig');
const {
    DEFAULT_CHANNEL_THRESHOLD,
    DEFAULT_MAX_DIFF_RATIO,
    comparePngBuffers,
    writeDiffPng
} = require('./e2e/visualRegression');

const BASELINE_DIR = path.join(__dirname, 'e2e', 'baselines', 'responsive-visual');

async function createPng(width, height, background) {
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background
        }
    }).png().toBuffer();
}

test('visual comparison ignores small channel noise and reports meaningful pixel changes', async () => {
    const baseline = await createPng(4, 3, { r: 30, g: 40, b: 50, alpha: 1 });
    const tolerated = await createPng(4, 3, {
        r: 30 + DEFAULT_CHANNEL_THRESHOLD,
        g: 40,
        b: 50,
        alpha: 1
    });
    const changed = await createPng(4, 3, { r: 220, g: 40, b: 50, alpha: 1 });

    const toleratedResult = await comparePngBuffers(baseline, tolerated);
    const changedResult = await comparePngBuffers(baseline, changed);

    assert.equal(toleratedResult.dimensionsMatch, true);
    assert.equal(toleratedResult.differentPixels, 0);
    assert.equal(changedResult.differentPixels, 12);
    assert.equal(changedResult.diffRatio, 1);
    assert.ok(DEFAULT_MAX_DIFF_RATIO > 0 && DEFAULT_MAX_DIFF_RATIO < 0.01);
});

test('visual comparison rejects screenshots with different dimensions', async () => {
    const baseline = await createPng(4, 3, { r: 10, g: 20, b: 30, alpha: 1 });
    const current = await createPng(5, 3, { r: 10, g: 20, b: 30, alpha: 1 });
    const result = await comparePngBuffers(baseline, current);

    assert.equal(result.dimensionsMatch, false);
    assert.deepEqual(result.baselineSize, { width: 4, height: 3 });
    assert.deepEqual(result.currentSize, { width: 5, height: 3 });
});

test('visual comparison writes a valid PNG diff for changed pixels', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-visual-diff-'));
    const diffPath = path.join(tempDir, 'changed.diff.png');

    try {
        const baseline = await createPng(3, 2, { r: 10, g: 20, b: 30, alpha: 1 });
        const current = await createPng(3, 2, { r: 210, g: 20, b: 30, alpha: 1 });
        const comparison = await comparePngBuffers(baseline, current);

        assert.equal(await writeDiffPng(comparison, diffPath), true);
        const metadata = await sharp(diffPath).metadata();
        assert.equal(metadata.format, 'png');
        assert.equal(metadata.width, 3);
        assert.equal(metadata.height, 2);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('responsive visual baselines cover every viewport and state', () => {
    const expectedFiles = VIEWPORTS.flatMap(viewport => (
        ['home', 'game'].map(state => `${viewport.label}-${state}.png`)
    )).sort();
    const actualFiles = fs.existsSync(BASELINE_DIR)
        ? fs.readdirSync(BASELINE_DIR).filter(file => file.endsWith('.png')).sort()
        : [];

    assert.deepEqual(actualFiles, expectedFiles);
});
