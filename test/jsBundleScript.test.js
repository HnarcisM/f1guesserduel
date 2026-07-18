const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { buildJsBundle } = require('../scripts/build-js-bundle');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
}

test('JavaScript build bundles imports into a minified browser IIFE', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-js-bundle-'));
    writeFile(rootDir, 'public/math.js', 'export const add = (left, right) => left + right;');
    writeFile(rootDir, 'public/game.js', [
        "import { add } from './math.js';",
        'globalThis.bundleResult = add(20, 22);'
    ].join('\n'));

    const result = buildJsBundle(rootDir);
    const bundle = fs.readFileSync(path.join(rootDir, result.outputFile), 'utf8');
    const context = {};
    vm.runInNewContext(bundle, context);

    assert.equal(context.bundleResult, 42);
    assert.equal(result.inputFiles, 2);
    assert.ok(result.bundleBytes < result.sourceBytes);
    assert.ok(result.gzipBytes > 0);
    assert.ok(result.brotliBytes > 0);
    assert.match(bundle, /^"use strict";/);
    assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m);
    assert.doesNotMatch(bundle, /sourceMappingURL/);
});

test('production HTML loads the generated bundle after Socket.IO', () => {
    const rootDir = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
    const bundlePath = path.join(rootDir, 'public', 'game.bundle.min.js');
    const socketPosition = html.indexOf('/socket.io/socket.io.js');
    const bundlePosition = html.indexOf('/game.bundle.min.js?v=frontend-bundle-11');

    assert.ok(fs.existsSync(bundlePath));
    assert.ok(socketPosition > html.indexOf('<body'));
    assert.ok(bundlePosition > socketPosition);
    assert.match(html, /<script defer src="\/game\.bundle\.min\.js\?v=frontend-bundle-11"><\/script>/);
    assert.doesNotMatch(html, /<script[^>]+src="\/game\.js/);

    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const sourceBytes = [
        path.join(rootDir, 'public', 'game.js'),
        ...fs.readdirSync(path.join(rootDir, 'public', 'js'))
            .filter(fileName => fileName.endsWith('.js') && fileName !== 'themeBootstrap.js')
            .map(fileName => path.join(rootDir, 'public', 'js', fileName))
    ].reduce((total, filePath) => total + fs.statSync(filePath).size, 0);

    assert.ok(bundle.length < sourceBytes);
    assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m);
    assert.doesNotMatch(bundle, /sourceMappingURL/);
});
