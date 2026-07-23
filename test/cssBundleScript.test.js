const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const MAX_MINIFIED_CSS_BYTES = 120_000;
const MAX_GZIP_CSS_BYTES = 25_000;

const {
    GENERATED_HEADER,
    buildCssBundle,
    minifyCss,
    normalizeImportPath,
    parseCssImports
} = require('../scripts/build-css-bundle');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
}

test('CSS import parser keeps ordered module paths and strips cache query params', () => {
    const imports = parseCssImports(`
        @import url("/css/01-theme-tokens.css?v=123");
        @import url('/css/02-header-menu.css?v=456');
    `);

    assert.deepEqual(imports, [
        'css/01-theme-tokens.css',
        'css/02-header-menu.css'
    ]);
    assert.equal(normalizeImportPath('url("/css/app.css?v=1")'), 'css/app.css');
});

test('CSS bundle is minified without runtime @import rules', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-css-bundle-test-'));

    writeFile(rootDir, 'public/style.css', [
        '/** entry comment */',
        '@import url("/css/01-base.css?v=1");',
        '@import url("/css/02-overrides.css?v=1");'
    ].join('\n'));
    writeFile(rootDir, 'public/css/01-base.css', '.base { color: white; }');
    writeFile(rootDir, 'public/css/02-overrides.css', '.base { font-weight: 700; }');

    const result = buildCssBundle(rootDir);
    const bundle = fs.readFileSync(path.join(rootDir, result.outputFile), 'utf8');

    assert.equal(result.imports.length, 2);
    assert.equal(result.bytes, Buffer.byteLength(bundle, 'utf8'));
    assert.ok(result.sourceBytes > 0);
    assert.equal(result.savedBytes, Math.max(0, result.sourceBytes - result.bytes));
    assert.ok(bundle.startsWith(`${GENERATED_HEADER}\n`));
    assert.match(bundle, /\.base\{color:#fff\}/);
    assert.match(bundle, /\.base\{font-weight:700\}/);
    assert.doesNotMatch(bundle, /entry comment|Source:/);
    assert.doesNotMatch(bundle, /@import\s+/);
});

test('CSS minification preserves UTF-8 content and removes non-legal comments', () => {
    const source = '/* remove */ .share::before { content: "🔗"; color: white; }';
    const minified = minifyCss(source);

    assert.equal(minified, '.share:before{content:"🔗";color:#fff}');
    assert.ok(Buffer.byteLength(minified, 'utf8') < Buffer.byteLength(source, 'utf8'));
});

test('CSS bundle is deterministic across mixed source line endings', () => {
    const windowsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-css-bundle-windows-test-'));
    const unixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-css-bundle-unix-test-'));

    writeFile(windowsRoot, 'public/style.css', [
        '/** entry comment */',
        '@import url("/css/01-base.css?v=1");',
        '@import url("/css/02-overrides.css?v=1");'
    ].join('\r\n'));
    writeFile(windowsRoot, 'public/css/01-base.css', '.base {\r\n    color: white;\r\n}\r\n');
    writeFile(windowsRoot, 'public/css/02-overrides.css', '.override {\r    font-weight: 700;\r}\r');

    writeFile(unixRoot, 'public/style.css', [
        '/** entry comment */',
        '@import url("/css/01-base.css?v=1");',
        '@import url("/css/02-overrides.css?v=1");'
    ].join('\n'));
    writeFile(unixRoot, 'public/css/01-base.css', '.base {\n    color: white;\n}\n');
    writeFile(unixRoot, 'public/css/02-overrides.css', '.override {\n    font-weight: 700;\n}\n');

    const windowsResult = buildCssBundle(windowsRoot);
    const unixResult = buildCssBundle(unixRoot);
    const windowsBundle = fs.readFileSync(path.join(windowsRoot, windowsResult.outputFile), 'utf8');
    const unixBundle = fs.readFileSync(path.join(unixRoot, unixResult.outputFile), 'utf8');

    assert.doesNotMatch(windowsBundle, /\r/);
    assert.equal(windowsBundle, unixBundle);
});

test('frontend loads the generated CSS bundle instead of the import-based stylesheet', () => {
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
    const bundleCss = fs.readFileSync(path.join(process.cwd(), 'public/style.bundle.css'), 'utf8');

    assert.match(indexHtml, /href="\/style\.bundle\.css\?/);
    assert.doesNotMatch(indexHtml, /href="\/style\.css\?/);
    const minifiedBytes = Buffer.byteLength(bundleCss, 'utf8');
    const gzipBytes = zlib.gzipSync(bundleCss, { level: zlib.constants.Z_BEST_COMPRESSION }).byteLength;

    assert.ok(bundleCss.startsWith(`${GENERATED_HEADER}\n`));
    assert.ok(
        minifiedBytes <= MAX_MINIFIED_CSS_BYTES,
        `CSS bundle is ${minifiedBytes} bytes; maximum is ${MAX_MINIFIED_CSS_BYTES} bytes`
    );
    assert.ok(
        gzipBytes <= MAX_GZIP_CSS_BYTES,
        `Gzipped CSS bundle is ${gzipBytes} bytes; maximum is ${MAX_GZIP_CSS_BYTES} bytes`
    );
    assert.doesNotMatch(bundleCss, /Source: public\/css\//);
    assert.doesNotMatch(bundleCss, /@import\s+/);
});

test('esbuild remains available to production-only deployment builds', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    assert.match(packageJson.dependencies?.esbuild || '', /^\^0\.28\./);
    assert.equal(packageJson.devDependencies?.esbuild, undefined);
});
