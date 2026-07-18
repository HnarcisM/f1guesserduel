const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const esbuild = require('esbuild');

const DEFAULT_ENTRY_FILE = path.join('public', 'game.js');
const DEFAULT_OUTPUT_FILE = path.join('public', 'game.bundle.min.js');

function normalizePathForOutput(inputPath) {
    return String(inputPath || '').replace(/\\/g, '/');
}

function buildJsBundle(rootDir = process.cwd(), options = {}) {
    const entryFile = options.entryFile || DEFAULT_ENTRY_FILE;
    const outputFile = options.outputFile || DEFAULT_OUTPUT_FILE;
    const entryPath = path.join(rootDir, entryFile);
    const outputPath = path.join(rootDir, outputFile);

    if (!fs.existsSync(entryPath)) {
        throw new Error(`JavaScript entry file not found: ${entryFile}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const result = esbuild.buildSync({
        absWorkingDir: rootDir,
        entryPoints: [entryFile],
        outfile: outputFile,
        bundle: true,
        minify: true,
        treeShaking: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        charset: 'utf8',
        legalComments: 'none',
        sourcemap: false,
        metafile: true,
        logLevel: 'silent',
        banner: {
            js: '"use strict";'
        }
    });

    const bundle = fs.readFileSync(outputPath);
    const inputPaths = Object.keys(result.metafile.inputs)
        .map(normalizePathForOutput)
        .sort();
    const sourceBytes = Object.values(result.metafile.inputs)
        .reduce((total, input) => total + (input.bytes || 0), 0);
    const brotliBytes = zlib.brotliCompressSync(bundle, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11
        }
    }).length;

    return {
        entryFile: normalizePathForOutput(entryFile),
        outputFile: normalizePathForOutput(outputFile),
        inputPaths,
        inputFiles: inputPaths.length,
        sourceBytes,
        bundleBytes: bundle.length,
        gzipBytes: zlib.gzipSync(bundle, { level: zlib.constants.Z_BEST_COMPRESSION }).length,
        brotliBytes
    };
}

function runCli() {
    const result = buildJsBundle(process.cwd());
    const reduction = result.sourceBytes > 0
        ? ((1 - result.bundleBytes / result.sourceBytes) * 100).toFixed(1)
        : '0.0';

    console.log(`Bundle JS creat: ${result.outputFile}`);
    console.log(`Module JS incluse: ${result.inputFiles}`);
    console.log(`Surse: ${(result.sourceBytes / 1024).toFixed(2)} KB`);
    console.log(`Bundle minificat: ${(result.bundleBytes / 1024).toFixed(2)} KB (${reduction}% mai mic)`);
    console.log(`Bundle gzip: ${(result.gzipBytes / 1024).toFixed(2)} KB`);
    console.log(`Bundle Brotli: ${(result.brotliBytes / 1024).toFixed(2)} KB`);
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(`Eroare build JavaScript: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_ENTRY_FILE,
    DEFAULT_OUTPUT_FILE,
    buildJsBundle,
    normalizePathForOutput
};
