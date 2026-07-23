const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const {
    MAX_NORMALIZED_RMSE,
    calculateNormalizedRmse,
    compareRasterBuffers,
    optimizeRasterFile,
    resolveOriginalForWebp,
    resolveOutputPath
} = require('../scripts/optimize-raster-assets');
const { collectRequiredReleaseAssets } = require('../scripts/create-release-zip');

test('raster optimizer creates a smaller WebP with matching dimensions and bounded visual error', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-raster-optimize-'));
    const sourcePath = path.join(rootDir, 'logo.png');
    const outputPath = path.join(rootDir, 'logo.webp');
    await sharp({
        create: {
            width: 320,
            height: 180,
            channels: 4,
            background: { r: 220, g: 0, b: 0, alpha: 0.85 }
        }
    }).png().toFile(sourcePath);

    const result = await optimizeRasterFile(sourcePath, { outputPath });
    const outputMetadata = await sharp(outputPath).metadata();

    assert.equal(result.selected, true);
    assert.equal(result.changed, true);
    assert.ok(result.savedBytes > 0);
    assert.equal(result.dimensionsMatch, true);
    assert.ok(result.normalizedRmse <= MAX_NORMALIZED_RMSE);
    assert.equal(outputMetadata.format, 'webp');
    assert.equal(outputMetadata.width, 320);
    assert.equal(outputMetadata.height, 180);

    const repeatedResult = await optimizeRasterFile(sourcePath, { outputPath });
    assert.equal(repeatedResult.selected, true);
    assert.equal(repeatedResult.changed, false);
});

test('raster optimizer keeps the original when the WebP candidate is larger', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-raster-keep-'));
    const sourcePath = path.join(rootDir, 'tiny.png');
    const outputPath = path.join(rootDir, 'tiny.webp');
    await sharp({
        create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 }
        }
    }).png().toFile(sourcePath);

    const result = await optimizeRasterFile(sourcePath, {
        outputPath,
        async encodeWebp(sourceBuffer) {
            const validWebp = await sharp(sourceBuffer).webp().toBuffer();
            return Buffer.concat([validWebp, Buffer.alloc(1_000)]);
        }
    });

    assert.equal(result.selected, false);
    assert.equal(result.changed, false);
    assert.equal(result.savedBytes, 0);
    assert.equal(fs.existsSync(outputPath), false);
});

test('raster comparison utilities reject incompatible buffers and changed dimensions', async () => {
    assert.throws(() => calculateNormalizedRmse(Buffer.from([0]), Buffer.from([0, 1])), /same non-zero length/);

    const first = await sharp({
        create: { width: 10, height: 10, channels: 3, background: 'red' }
    }).png().toBuffer();
    const second = await sharp({
        create: { width: 11, height: 10, channels: 3, background: 'red' }
    }).webp().toBuffer();
    const comparison = await compareRasterBuffers(first, second);

    assert.equal(comparison.dimensionsMatch, false);
    assert.equal(comparison.normalizedRmse, Number.POSITIVE_INFINITY);
});


test('raster sources stay outside public while runtime JPG fallbacks remain deployable', () => {
    const rootDir = path.resolve(__dirname, '..');
    const publicRasterSources = fs.readdirSync(path.join(rootDir, 'public', 'logos'))
        .filter(fileName => /\.(?:png|jpe?g)$/i.test(fileName))
        .sort();
    const privateRasterSources = fs.readdirSync(path.join(rootDir, 'assets-src', 'logos'))
        .filter(fileName => /\.(?:png|jpe?g)$/i.test(fileName))
        .sort();

    assert.deepEqual(publicRasterSources, ['BrawnGP.jpg', 'Spyker.jpg']);
    assert.equal(privateRasterSources.length, 30);
    assert.ok(privateRasterSources.includes('Ferrari.png'));
    assert.equal(
        resolveOriginalForWebp(rootDir, 'public/logos/Ferrari.webp'),
        'assets-src/logos/Ferrari.png'
    );
    assert.equal(
        resolveOutputPath(rootDir, 'assets-src/logos/Ferrari.png'),
        path.join(rootDir, 'public', 'logos', 'Ferrari.webp')
    );
});

test('production WebP logos are smaller than their sources and stay within the visual threshold', async () => {
    const rootDir = path.resolve(__dirname, '..');
    const rasterAssets = [...collectRequiredReleaseAssets(rootDir)]
        .filter(assetPath => /\.(?:jpe?g|png|webp)$/i.test(assetPath));
    const webpAssets = rasterAssets.filter(assetPath => assetPath.endsWith('.webp'));

    assert.equal(rasterAssets.length, 28);
    assert.equal(webpAssets.length, 26);

    for (const webpPath of webpAssets) {
        const sourcePath = resolveOriginalForWebp(rootDir, webpPath);
        assert.ok(sourcePath, `Missing raster source for ${webpPath}`);

        const sourceBuffer = fs.readFileSync(path.join(rootDir, sourcePath));
        const webpBuffer = fs.readFileSync(path.join(rootDir, webpPath));
        const comparison = await compareRasterBuffers(sourceBuffer, webpBuffer);

        assert.ok(webpBuffer.length < sourceBuffer.length, `${webpPath} is not smaller than its source`);
        assert.equal(comparison.dimensionsMatch, true, `${webpPath} changed dimensions`);
        assert.ok(
            comparison.normalizedRmse <= MAX_NORMALIZED_RMSE,
            `${webpPath} exceeds the visual error threshold`
        );
    }
});
