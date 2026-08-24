const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

const {
    DEFAULT_INPUT_FILES,
    GENERATED_HEADER,
    buildGameHubBundle
} = require('../scripts/build-game-hub-bundle');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
}

test('Game Hub bundle preserves source order and executes as one classic script', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-game-hub-bundle-'));
    const inputFiles = [
        path.join('public', 'js', 'first.js'),
        path.join('public', 'js', 'second.js')
    ];
    writeFile(rootDir, inputFiles[0], 'globalThis.bundleOrder = ["first"];');
    writeFile(rootDir, inputFiles[1], 'globalThis.bundleOrder.push("second");');

    const result = buildGameHubBundle(rootDir, { inputFiles });
    const bundle = fs.readFileSync(path.join(rootDir, result.outputFile), 'utf8');
    const context = {};
    vm.runInNewContext(bundle, context);

    assert.deepEqual(Array.from(context.bundleOrder), ['first', 'second']);
    assert.equal(result.inputCount, 2);
    assert.ok(bundle.startsWith(`${GENERATED_HEADER}\n`));
    assert.doesNotMatch(bundle, /sourceMappingURL/);
});

test('Game Hub bundle is deterministic across source line endings', () => {
    const windowsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-game-hub-windows-'));
    const unixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-game-hub-unix-'));
    const inputFiles = [path.join('public', 'js', 'module.js')];

    writeFile(windowsRoot, inputFiles[0], '(function () {\r\n  globalThis.ready = true;\r\n})();\r\n');
    writeFile(unixRoot, inputFiles[0], '(function () {\n  globalThis.ready = true;\n})();\n');

    const windowsResult = buildGameHubBundle(windowsRoot, { inputFiles });
    const unixResult = buildGameHubBundle(unixRoot, { inputFiles });

    assert.equal(
        fs.readFileSync(path.join(windowsRoot, windowsResult.outputFile), 'utf8'),
        fs.readFileSync(path.join(unixRoot, unixResult.outputFile), 'utf8')
    );
});

test('production Game Hub bundle replaces individual startup scripts with a smaller compressed transfer', () => {
    const projectRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
    const bundlePath = path.join(projectRoot, 'public', 'game-hub.bundle.js');
    const bundle = fs.readFileSync(bundlePath);
    const bundlePosition = html.search(/\/game-hub\.bundle\.js\?v=[a-f0-9]{16}/);
    const runtimePosition = html.indexOf('/js/runtimeExperienceController.js');
    const gameBundlePosition = html.indexOf('/game.bundle.min.js');

    assert.ok(bundlePosition > runtimePosition);
    assert.ok(gameBundlePosition > bundlePosition);
    assert.match(html, /<script src="\/game-hub\.bundle\.js\?v=[a-f0-9]{16}"><\/script>/);

    let separateGzipBytes = 0;
    for (const relativePath of DEFAULT_INPUT_FILES) {
        const publicUrl = `/${relativePath.replace(/^public[\\/]/, '').replaceAll('\\', '/')}`;
        assert.equal(html.includes(publicUrl), false, `${publicUrl} must not be loaded separately in production`);
        separateGzipBytes += zlib.gzipSync(
            fs.readFileSync(path.join(projectRoot, relativePath)),
            { level: zlib.constants.Z_BEST_COMPRESSION }
        ).length;
    }

    const context = {};
    vm.runInNewContext(bundle.toString('utf8'), context);
    for (const globalName of [
        'F1GameVariantRegistry',
        'F1GameHubViewCore',
        'F1GameHubProfileView',
        'F1GameHubDuelRoomView',
        'F1GameHubCardsView',
        'F1GameHubDashboardView',
        'F1GameHub'
    ]) assert.ok(context[globalName], `${globalName} must be exposed by the production bundle`);

    const bundleGzipBytes = zlib.gzipSync(bundle, { level: zlib.constants.Z_BEST_COMPRESSION }).length;
    assert.ok(bundleGzipBytes < separateGzipBytes);
    assert.ok(bundle.length <= 70_000, `Game Hub bundle is ${bundle.length} bytes; maximum is 70000`);
    assert.ok(bundleGzipBytes <= 15_000, `Game Hub gzip is ${bundleGzipBytes} bytes; maximum is 15000`);
});


test('package build runs the Game Hub bundle before frontend versioning', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['build:game-hub'], 'node scripts/build-game-hub-bundle.js');
    assert.match(packageJson.scripts.build, /build:js && npm run build:game-hub && npm run build:version/);
});
