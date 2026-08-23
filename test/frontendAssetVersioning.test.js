const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    DEFAULT_ASSETS,
    DEFAULT_PRECACHE_STATIC_URLS,
    createContentVersion,
    createPrecacheUrls,
    updateServiceWorkerPrecache,
    versionFrontendAssets
} = require('../scripts/version-frontend-assets');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
}

function getFixtureContent(relativePath) {
    const normalizedPath = String(relativePath).replaceAll('\\', '/');
    if (normalizedPath === 'public/manifest.webmanifest') return '{"name":"F1 Guesser"}\n';
    if (normalizedPath === 'public/icons/pwa-192.png') return 'icon-192';
    if (normalizedPath === 'public/icons/pwa-512.png') return 'icon-512';
    if (normalizedPath === 'public/js/themeBootstrap.js') return 'bootstrap();\r\n';
    if (normalizedPath === 'public/style.bundle.css') return '.app { color: red; }\n';
    if (normalizedPath === 'public/game.bundle.min.js') return 'startGame();\n';

    switch (path.extname(normalizedPath).toLowerCase()) {
        case '.css':
            return `.fixture { content: ${JSON.stringify(normalizedPath)}; }\n`;
        case '.html':
            return `<main>${normalizedPath}</main>\n`;
        case '.js':
        case '.mjs':
            return `// fixture for ${normalizedPath}\n`;
        case '.json':
        case '.webmanifest':
            return '{}\n';
        default:
            return `fixture:${normalizedPath}`;
    }
}

function getPrecacheFixturePath(staticUrl) {
    const pathname = new URL(staticUrl, 'http://localhost').pathname;
    const relativePath = path.join('public', pathname.replace(/^\/+/, ''));
    return pathname.endsWith('/') ? path.join(relativePath, 'index.html') : relativePath;
}

function createAssetReference(asset) {
    const versionedPath = `${asset.publicPath}?v=manual-version`;
    if (asset.attribute === 'href') return `<link href="${versionedPath}">`;
    return `<script src="${versionedPath}"></script>`;
}

function createFixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-asset-versioning-'));
    const fixtureFiles = new Set(DEFAULT_ASSETS.map(asset => asset.sourceFile));

    for (const staticUrl of DEFAULT_PRECACHE_STATIC_URLS) {
        fixtureFiles.add(getPrecacheFixturePath(staticUrl));
    }

    fixtureFiles.delete(path.join('public', 'index.html'));
    fixtureFiles.delete(path.join('public', 'service-worker.js'));
    for (const relativePath of fixtureFiles) {
        writeFile(rootDir, relativePath, getFixtureContent(relativePath));
    }

    writeFile(rootDir, 'public/service-worker.js', [
        'const CACHE_PREFIX = \'f1-guesser-static-\';',
        '/* GENERATED_PRECACHE_START */',
        'const STATIC_CACHE_NAME = \'f1-guesser-static-development\';',
        'const PRECACHE_URLS = Object.freeze([]);',
        '/* GENERATED_PRECACHE_END */'
    ].join('\n'));
    writeFile(rootDir, 'public/index.html', [
        ...DEFAULT_ASSETS.map(createAssetReference),
        '<script src="/other.js?v=keep-this"></script>'
    ].join('\n'));
    return rootDir;
}

test('fixture follows configured assets and precache URLs automatically', () => {
    const rootDir = createFixture();

    for (const asset of DEFAULT_ASSETS) {
        assert.equal(
            fs.statSync(path.join(rootDir, asset.sourceFile)).isFile(),
            true,
            `${asset.sourceFile} must exist in the fixture`
        );
    }
    for (const staticUrl of DEFAULT_PRECACHE_STATIC_URLS) {
        const relativePath = getPrecacheFixturePath(staticUrl);
        assert.equal(
            fs.statSync(path.join(rootDir, relativePath)).isFile(),
            true,
            `${staticUrl} must resolve to a fixture file`
        );
    }
});

test('frontend asset versioning replaces manual values with deterministic content hashes', () => {
    const rootDir = createFixture();
    const firstResult = versionFrontendAssets(rootDir);
    const firstHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');

    assert.equal(firstResult.changed, true);
    assert.equal(firstResult.assets.length, DEFAULT_ASSETS.length);
    for (const asset of firstResult.assets) {
        assert.match(asset.version, /^[a-f0-9]{16}$/);
        assert.ok(firstHtml.includes(`${asset.publicPath}?v=${asset.version}`));
    }
    assert.match(firstHtml, /\/other\.js\?v=keep-this/);
    assert.equal(
        firstResult.serviceWorker.precacheUrls.length,
        createPrecacheUrls(firstResult.assets, DEFAULT_PRECACHE_STATIC_URLS).length
    );
    assert.ok(
        firstResult.serviceWorker.precacheUrls.length
            < DEFAULT_ASSETS.length + DEFAULT_PRECACHE_STATIC_URLS.length,
        'overlapping versioned and unversioned assets must share one precache entry'
    );
    const serviceWorker = fs.readFileSync(path.join(rootDir, 'public', 'service-worker.js'), 'utf8');
    assert.match(serviceWorker, /f1-guesser-static-[a-f0-9]{20}/);
    for (const url of firstResult.serviceWorker.precacheUrls) {
        assert.ok(serviceWorker.includes(JSON.stringify(url)), `${url} must be precached`);
    }

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

test('changing an unversioned precache icon rotates the service worker cache', () => {
    const rootDir = createFixture();
    versionFrontendAssets(rootDir);
    const serviceWorkerPath = path.join(rootDir, 'public', 'service-worker.js');
    const firstWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
    const firstCache = firstWorker.match(/f1-guesser-static-[a-f0-9]{20}/)?.[0];

    writeFile(rootDir, 'public/icons/pwa-192.png', 'updated-icon-192');
    const result = versionFrontendAssets(rootDir);
    const secondWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
    const secondCache = secondWorker.match(/f1-guesser-static-[a-f0-9]{20}/)?.[0];

    assert.equal(result.changed, true);
    assert.ok(firstCache);
    assert.ok(secondCache);
    assert.notEqual(secondCache, firstCache);
});

test('frontend asset versioning fails when a required reference is missing or duplicated', () => {
    const missingRoot = createFixture();
    writeFile(missingRoot, 'public/index.html', '<script src="/game.bundle.min.js"></script>');
    assert.throws(
        () => versionFrontendAssets(missingRoot),
        /Expected exactly one \/manifest\.webmanifest reference/
    );

    const duplicateRoot = createFixture();
    const indexPath = path.join(duplicateRoot, 'public', 'index.html');
    fs.appendFileSync(indexPath, '\n<script src="/js/themeBootstrap.js"></script>');
    assert.throws(
        () => versionFrontendAssets(duplicateRoot),
        /found 2/
    );
});

test('precache generation is deterministic, unique and excludes dynamic endpoints', () => {
    const urls = createPrecacheUrls([
        { publicPath: '/game.bundle.min.js', version: 'abc123' },
        { publicPath: '/style.bundle.css', version: 'def456' },
        { publicPath: '/game.bundle.min.js', version: 'abc123' }
    ], [
        '/index.html',
        '/index.html',
        '/icons/pwa-192.png',
        '/game.bundle.min.js'
    ]);

    assert.deepEqual(urls, [
        '/index.html',
        '/icons/pwa-192.png',
        '/game.bundle.min.js?v=abc123',
        '/style.bundle.css?v=def456'
    ]);
    assert.equal(
        new Set(urls.map(url => new URL(url, 'http://localhost').pathname)).size,
        urls.length
    );
    assert.equal(urls.some(url => url.startsWith('/api')), false);
    assert.equal(urls.some(url => url.startsWith('/socket.io')), false);
});

test('default precache keeps functional offline assets but defers Game Hub artwork', () => {
    assert.ok(DEFAULT_PRECACHE_STATIC_URLS.includes('/index.html'));
    assert.ok(DEFAULT_PRECACHE_STATIC_URLS.includes('/modes/track/'));
    assert.ok(DEFAULT_PRECACHE_STATIC_URLS.includes('/js/modes/trackPage.js'));
    assert.equal(
        DEFAULT_PRECACHE_STATIC_URLS.some(url => url.startsWith('/images/game-hub/')),
        false
    );
});

test('service worker precache updater replaces only the generated block', () => {
    const source = [
        'before();',
        '/* GENERATED_PRECACHE_START */',
        'old generated content',
        '/* GENERATED_PRECACHE_END */',
        'after();'
    ].join('\n');
    const updated = updateServiceWorkerPrecache(source, ['/style.css?v=123', '/index.html']);

    assert.match(updated, /before\(\);/);
    assert.match(updated, /after\(\);/);
    assert.match(updated, /f1-guesser-static-[a-f0-9]{20}/);
    assert.match(updated, /"\/index\.html"/);
    assert.match(updated, /"\/style\.css\?v=123"/);
    assert.doesNotMatch(updated, /old generated content/);
    assert.throws(
        () => updateServiceWorkerPrecache('missing markers', []),
        /precache markers/
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
