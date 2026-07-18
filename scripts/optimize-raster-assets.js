const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const { collectRequiredReleaseAssets, normalizePath } = require('./create-release-zip');

const SOURCE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const MAX_NORMALIZED_RMSE = 0.005;
const COMPARISON_BACKGROUNDS = [
    { r: 255, g: 255, b: 255 },
    { r: 32, g: 36, b: 43 }
];
const WEBP_OPTIONS = Object.freeze({
    nearLossless: true,
    quality: 95,
    alphaQuality: 100,
    effort: 6
});

function calculateNormalizedRmse(left, right) {
    if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length || left.length === 0) {
        throw new Error('Raster comparison buffers must have the same non-zero length.');
    }

    let squaredError = 0;
    for (let index = 0; index < left.length; index += 1) {
        const difference = left[index] - right[index];
        squaredError += difference * difference;
    }
    return Math.sqrt(squaredError / left.length) / 255;
}

async function renderComposite(buffer, background) {
    return sharp(buffer)
        .flatten({ background })
        .removeAlpha()
        .raw()
        .toBuffer();
}

async function compareRasterBuffers(sourceBuffer, candidateBuffer) {
    const [sourceMetadata, candidateMetadata] = await Promise.all([
        sharp(sourceBuffer).metadata(),
        sharp(candidateBuffer).metadata()
    ]);

    if (sourceMetadata.width !== candidateMetadata.width || sourceMetadata.height !== candidateMetadata.height) {
        return {
            dimensionsMatch: false,
            normalizedRmse: Number.POSITIVE_INFINITY
        };
    }

    const errors = [];
    for (const background of COMPARISON_BACKGROUNDS) {
        const [sourcePixels, candidatePixels] = await Promise.all([
            renderComposite(sourceBuffer, background),
            renderComposite(candidateBuffer, background)
        ]);
        errors.push(calculateNormalizedRmse(sourcePixels, candidatePixels));
    }

    return {
        dimensionsMatch: true,
        normalizedRmse: Math.max(...errors)
    };
}

async function encodeWebp(sourceBuffer) {
    return sharp(sourceBuffer).webp(WEBP_OPTIONS).toBuffer();
}

function resolveOriginalForWebp(rootDir, relativeWebpPath) {
    const parsed = path.parse(relativeWebpPath);
    for (const extension of SOURCE_EXTENSIONS) {
        const candidate = normalizePath(path.join(parsed.dir, `${parsed.name}${extension}`));
        if (fs.existsSync(path.join(rootDir, candidate))) return candidate;
    }
    return null;
}

function collectRasterSourcePaths(rootDir) {
    const requiredAssets = [...(collectRequiredReleaseAssets(rootDir) || [])];
    const sources = new Set();

    for (const assetPath of requiredAssets) {
        const normalized = normalizePath(assetPath);
        const extension = path.extname(normalized).toLowerCase();
        if (SOURCE_EXTENSIONS.includes(extension)) {
            sources.add(normalized);
            continue;
        }
        if (extension === '.webp') {
            const sourcePath = resolveOriginalForWebp(rootDir, normalized);
            if (sourcePath) sources.add(sourcePath);
        }
    }

    return [...sources].sort();
}

async function optimizeRasterFile(absoluteSourcePath, options = {}) {
    const sourceBuffer = fs.readFileSync(absoluteSourcePath);
    const sourceExtension = path.extname(absoluteSourcePath);
    const outputPath = options.outputPath
        || absoluteSourcePath.slice(0, -sourceExtension.length) + '.webp';
    const candidateBuffer = await (options.encodeWebp || encodeWebp)(sourceBuffer);
    const comparison = await compareRasterBuffers(sourceBuffer, candidateBuffer);
    const selected = candidateBuffer.length < sourceBuffer.length
        && comparison.dimensionsMatch
        && comparison.normalizedRmse <= (options.maxNormalizedRmse ?? MAX_NORMALIZED_RMSE);
    let changed = false;

    if (selected && options.write !== false) {
        const existingBuffer = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
        changed = !existingBuffer || !existingBuffer.equals(candidateBuffer);
        if (changed) fs.writeFileSync(outputPath, candidateBuffer);
    }

    return {
        sourcePath: normalizePath(absoluteSourcePath),
        outputPath: normalizePath(outputPath),
        beforeBytes: sourceBuffer.length,
        candidateBytes: candidateBuffer.length,
        selectedBytes: selected ? candidateBuffer.length : sourceBuffer.length,
        savedBytes: selected ? sourceBuffer.length - candidateBuffer.length : 0,
        normalizedRmse: comparison.normalizedRmse,
        dimensionsMatch: comparison.dimensionsMatch,
        selected,
        changed
    };
}

async function optimizeRasterAssets(rootDir = process.cwd()) {
    const sourcePaths = collectRasterSourcePaths(rootDir);
    const results = [];

    for (const relativePath of sourcePaths) {
        results.push(await optimizeRasterFile(path.join(rootDir, relativePath)));
    }

    return {
        scannedFiles: results.length,
        optimizedFiles: results.filter(result => result.selected).length,
        updatedFiles: results.filter(result => result.changed).length,
        beforeBytes: results.reduce((total, result) => total + result.beforeBytes, 0),
        afterBytes: results.reduce((total, result) => total + result.selectedBytes, 0),
        savedBytes: results.reduce((total, result) => total + result.savedBytes, 0),
        maxNormalizedRmse: results.reduce(
            (maximum, result) => Math.max(maximum, result.selected ? result.normalizedRmse : 0),
            0
        ),
        results
    };
}

async function runCli() {
    const report = await optimizeRasterAssets(process.cwd());
    const savedPercent = report.beforeBytes > 0
        ? ((report.savedBytes / report.beforeBytes) * 100).toFixed(1)
        : '0.0';

    console.log(`Imagini raster analizate: ${report.scannedFiles}`);
    console.log(`Imagini WebP selectate: ${report.optimizedFiles}`);
    console.log(`Fișiere WebP actualizate: ${report.updatedFiles}`);
    console.log(`Dimensiune înainte: ${(report.beforeBytes / 1024).toFixed(2)} KB`);
    console.log(`Dimensiune după: ${(report.afterBytes / 1024).toFixed(2)} KB`);
    console.log(`Economie: ${(report.savedBytes / 1024).toFixed(2)} KB (${savedPercent}%)`);
    console.log(`Abatere vizuală maximă RMSE: ${(report.maxNormalizedRmse * 100).toFixed(3)}%`);
}

if (require.main === module) {
    runCli().catch(error => {
        console.error(`Eroare optimizare raster: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    MAX_NORMALIZED_RMSE,
    WEBP_OPTIONS,
    calculateNormalizedRmse,
    collectRasterSourcePaths,
    compareRasterBuffers,
    optimizeRasterAssets,
    optimizeRasterFile,
    resolveOriginalForWebp
};
