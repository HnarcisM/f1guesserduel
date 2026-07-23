const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    DEFAULT_ASSETS,
    createContentVersion,
    versionFrontendAssets
} = require('../scripts/version-frontend-assets');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
}

function createFixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-asset-versioning-'));
    writeFile(rootDir, 'public/js/themeBootstrap.js', 'bootstrap();\r\n');
    writeFile(rootDir, 'public/css/16-duel-ready.css', '.ready { color: green; }\n');
    writeFile(rootDir, 'public/css/17-duel-series.css', '.series { color: gold; }\n');
    writeFile(rootDir, 'public/css/18-duel-round-history.css', '.history { color: white; }\n');
    writeFile(rootDir, 'public/css/19-account-game-history.css', '.account-history { color: white; }\n');
    writeFile(rootDir, 'public/js/socketBridgeBootstrap.js', 'bridgeSocket();\n');
    writeFile(rootDir, 'public/js/duelReadyController.js', 'installReady();\n');
    writeFile(rootDir, 'public/js/duelSeriesController.js', 'installSeries();\n');
    writeFile(rootDir, 'public/js/duelRoundHistoryController.js', 'installHistory();\n');
    writeFile(rootDir, 'public/js/accountGameHistoryController.js', 'installAccountHistory();\n');
    writeFile(rootDir, 'public/style.bundle.css', '.app { color: red; }\n');
    writeFile(rootDir, 'public/game.bundle.min.js', 'startGame();\n');
    writeFile(rootDir, 'public/index.html', [
        '<script src="/js/themeBootstrap.js?v=manual-version"></script>',
        '<link rel="stylesheet" href="/style.bundle.css?v=manual-version">',
        '<link rel="stylesheet" href="/css/16-duel-ready.css?v=manual-version">',
        '<link rel="stylesheet" href="/css/17-duel-series.css?v=manual-version">',
        '<link rel="stylesheet" href="/css/18-duel-round-history.css?v=manual-version">',
        '<link rel="stylesheet" href="/css/19-account-game-history.css?v=manual-version">',
        '<script src="/js/socketBridgeBootstrap.js?v=manual-version"></script>',
        '<script src="/other.js?v=keep-this"></script>',
        '<script defer src="/game.bundle.min.js?v=manual-version"></script>',
        '<script type="module" src="/js/duelReadyController.js?v=manual-version"></script>',
        '<script type="module" src="/js/duelSeriesController.js?v=manual-version"></script>',
        '<script type="module" src="/js/duelRoundHistoryController.js?v=manual-version"></script>',
        '<script type="module" src="/js/accountGameHistoryController.js?v=manual-version"></script>'
    ].join('\n'));
    return rootDir;
}

test('frontend asset versioning replaces manual values with deterministic content hashes', () => {
    const rootDir = createFixture();
    const firstResult = versionFrontendAssets(rootDir);
    const firstHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');

    assert.equal(firstResult.changed, true);
    assert.equal(firstResult.assets.length, 12);
    for (const asset of firstResult.assets) {
        assert.match(asset.version, /^[a-f0-9]{16}$/);
        assert.ok(firstHtml.includes(`${asset.publicPath}?v=${asset.version}`));
    }
    assert.match(firstHtml, /\/other\.js\?v=keep-this/);

    const secondResult = versionFrontendAssets(rootDir);
    assert.equal(secondResult.changed, false);
    assert.equal(
        fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8'),
        firstHtml
    );
});

test('content hashes are stable across Windows and Unix line endings', () => {
    assert.equal(
        createContentVersion('line one\r\nline two\r\n'),
        createContentVersion('line one\nline two\n')
    );
});

test('changing one asset updates only that asset version', () => {
    const rootDir = createFixture();
    const firstResult = versionFrontendAssets(rootDir);
    const firstVersions = Object.fromEntries(
        firstResult.assets.map(asset => [asset.publicPath, asset.version])
    );

    writeFile(rootDir, 'public/game.bundle.min.js', 'startUpdatedGame();\n');
    const secondResult = versionFrontendAssets(rootDir);
    const secondVersions = Object.fromEntries(
        secondResult.assets.map(asset => [asset.publicPath, asset.version])
    );

    assert.equal(secondResult.changed, true);
    assert.equal(secondVersions['/js/themeBootstrap.js'], firstVersions['/js/themeBootstrap.js']);
    assert.equal(secondVersions['/style.bundle.css'], firstVersions['/style.bundle.css']);
    assert.notEqual(secondVersions['/game.bundle.min.js'], firstVersions['/game.bundle.min.js']);
});

test('frontend asset versioning fails when a required reference is missing or duplicated', () => {
    const missingRoot = createFixture();
    writeFile(missingRoot, 'public/index.html', '<script src="/game.bundle.min.js"></script>');
    assert.throws(
        () => versionFrontendAssets(missingRoot),
        /Expected exactly one \/js\/themeBootstrap\.js reference/
    );

    const duplicateRoot = createFixture();
    const indexPath = path.join(duplicateRoot, 'public', 'index.html');
    fs.appendFileSync(indexPath, '\n<script src="/js/themeBootstrap.js"></script>');
    assert.throws(
        () => versionFrontendAssets(duplicateRoot),
        /found 2/
    );
});

test('production HTML versions match the current frontend asset contents', () => {
    const projectRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');

    for (const asset of DEFAULT_ASSETS) {
        const content = fs.readFileSync(path.join(projectRoot, asset.sourceFile), 'utf8');
        const expectedVersion = createContentVersion(content);
        assert.ok(
            html.includes(`${asset.publicPath}?v=${expectedVersion}`),
            `${asset.publicPath} must use the current content hash`
        );
    }
});
