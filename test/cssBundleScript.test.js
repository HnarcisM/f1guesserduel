const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    buildCssBundle,
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

test('CSS bundle is generated without runtime @import rules', () => {
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
    assert.match(bundle, /Source: public\/css\/01-base\.css/);
    assert.match(bundle, /Source: public\/css\/02-overrides\.css/);
    assert.match(bundle, /\.base \{ color: white; \}/);
    assert.match(bundle, /\.base \{ font-weight: 700; \}/);
    assert.doesNotMatch(bundle, /@import\s+/);
});

test('CSS bundle normalizes mixed source line endings to LF only', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-css-bundle-line-endings-test-'));

    writeFile(rootDir, 'public/style.css', [
        '/** entry comment */',
        '@import url("/css/01-base.css?v=1");',
        '@import url("/css/02-overrides.css?v=1");'
    ].join('\r\n'));
    writeFile(rootDir, 'public/css/01-base.css', '.base {\r\n    color: white;\r\n}\r\n');
    writeFile(rootDir, 'public/css/02-overrides.css', '.override {\r    font-weight: 700;\r}\r');

    const result = buildCssBundle(rootDir);
    const bundle = fs.readFileSync(path.join(rootDir, result.outputFile), 'utf8');

    assert.doesNotMatch(bundle, /\r/);
    assert.match(bundle, /\.base \{\n    color: white;\n\}/);
    assert.match(bundle, /\.override \{\n    font-weight: 700;\n\}/);
});

test('frontend loads the generated CSS bundle instead of the import-based stylesheet', () => {
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
    const bundleCss = fs.readFileSync(path.join(process.cwd(), 'public/style.bundle.css'), 'utf8');

    assert.match(indexHtml, /href="\/style\.bundle\.css\?/);
    assert.doesNotMatch(indexHtml, /href="\/style\.css\?/);
    assert.match(bundleCss, /Source: public\/css\/01-theme-tokens\.css/);
    assert.match(bundleCss, /Source: public\/css\/12-toast\.css/);
    assert.doesNotMatch(bundleCss, /@import\s+/);
});
