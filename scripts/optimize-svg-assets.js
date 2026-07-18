const fs = require('node:fs');
const path = require('node:path');
const { optimize } = require('svgo');

const { collectRequiredReleaseAssets, normalizePath } = require('./create-release-zip');

const SVG_DIRECTORIES = [
    path.join('public', 'flags'),
    path.join('public', 'logos')
];

const SVG_OPTIMIZE_OPTIONS = Object.freeze({
    multipass: true,
    js2svg: {
        pretty: false
    },
    plugins: [{
        name: 'preset-default',
        params: {
            floatPrecision: 4,
            overrides: {
                cleanupIds: false
            }
        }
    }]
});

function getRootSvgTag(source) {
    return String(source || '').match(/<svg\b[^>]*>/i)?.[0] || null;
}

function getRootAttribute(source, attributeName) {
    const rootTag = getRootSvgTag(source);
    if (!rootTag) return null;

    const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = rootTag.match(new RegExp(`\\s${escapedName}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
    return match ? match[2] : null;
}

function assertRootGeometryPreserved(before, after, relativePath) {
    if (!getRootSvgTag(after)) {
        throw new Error(`SVGO produced invalid SVG output for ${relativePath}.`);
    }

    for (const attributeName of ['viewBox', 'width', 'height']) {
        const beforeValue = getRootAttribute(before, attributeName);
        if (beforeValue !== null && getRootAttribute(after, attributeName) === null) {
            throw new Error(`SVGO removed ${attributeName} from ${relativePath}.`);
        }
    }
}

function optimizeSvgFile(absolutePath, options = {}) {
    const relativePath = normalizePath(options.relativePath || absolutePath);
    const source = fs.readFileSync(absolutePath, 'utf8');
    const beforeBytes = Buffer.byteLength(source, 'utf8');
    const result = (options.optimizeSvg || optimize)(source, {
        ...SVG_OPTIMIZE_OPTIONS,
        path: absolutePath
    });
    const optimized = `${String(result.data || '').trim()}\n`;

    assertRootGeometryPreserved(source, optimized, relativePath);

    const afterBytes = Buffer.byteLength(optimized, 'utf8');
    const changed = afterBytes < beforeBytes && optimized !== source;
    if (changed && options.write !== false) {
        fs.writeFileSync(absolutePath, optimized, 'utf8');
    }

    return {
        relativePath,
        beforeBytes,
        afterBytes: changed ? afterBytes : beforeBytes,
        savedBytes: changed ? beforeBytes - afterBytes : 0,
        changed
    };
}

function walkSvgFiles(rootDir, relativeDirectory) {
    const absoluteDirectory = path.join(rootDir, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory)) return [];

    return fs.readdirSync(absoluteDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.svg'))
        .map(entry => normalizePath(path.join(relativeDirectory, entry.name)));
}

function collectSvgPaths(rootDir, { includeAll = false } = {}) {
    const candidates = includeAll
        ? SVG_DIRECTORIES.flatMap(directory => walkSvgFiles(rootDir, directory))
        : [...(collectRequiredReleaseAssets(rootDir) || [])];

    return [...new Set(candidates)]
        .map(normalizePath)
        .filter(relativePath => relativePath.toLowerCase().endsWith('.svg'))
        .sort();
}

function optimizeSvgAssets(rootDir = process.cwd(), options = {}) {
    const relativePaths = collectSvgPaths(rootDir, options);
    const results = relativePaths.map(relativePath => {
        const absolutePath = path.join(rootDir, relativePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Required SVG asset not found: ${relativePath}`);
        }
        return optimizeSvgFile(absolutePath, { relativePath });
    });

    return {
        scannedFiles: results.length,
        changedFiles: results.filter(result => result.changed).length,
        beforeBytes: results.reduce((total, result) => total + result.beforeBytes, 0),
        afterBytes: results.reduce((total, result) => total + result.afterBytes, 0),
        savedBytes: results.reduce((total, result) => total + result.savedBytes, 0),
        results
    };
}

function runCli() {
    const includeAll = process.argv.includes('--all');
    const report = optimizeSvgAssets(process.cwd(), { includeAll });
    const savedPercent = report.beforeBytes > 0
        ? ((report.savedBytes / report.beforeBytes) * 100).toFixed(1)
        : '0.0';

    console.log(`SVG-uri analizate: ${report.scannedFiles}`);
    console.log(`SVG-uri optimizate: ${report.changedFiles}`);
    console.log(`Dimensiune înainte: ${(report.beforeBytes / 1024).toFixed(2)} KB`);
    console.log(`Dimensiune după: ${(report.afterBytes / 1024).toFixed(2)} KB`);
    console.log(`Economie: ${(report.savedBytes / 1024).toFixed(2)} KB (${savedPercent}%)`);
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(`Eroare optimizare SVG: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    SVG_OPTIMIZE_OPTIONS,
    assertRootGeometryPreserved,
    collectSvgPaths,
    getRootAttribute,
    optimizeSvgAssets,
    optimizeSvgFile
};
