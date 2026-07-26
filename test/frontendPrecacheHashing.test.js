const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    createStaticAssetVersion,
    versionServiceWorker
} = require('../scripts/version-frontend-assets');

function writeFile(rootDir, relativePath, content) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
}

function createFixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-precache-hashing-'));
    writeFile(rootDir, 'public/js/app.js', 'lineOne();\nlineTwo();\n');
    writeFile(rootDir, 'public/icons/icon.png', Buffer.from([0, 1, 2, 3]));
    writeFile(rootDir, 'public/service-worker.js', [
        "const CACHE_PREFIX = 'f1-guesser-static-';",
        '/* GENERATED_PRECACHE_START */',
        "const STATIC_CACHE_NAME = 'f1-guesser-static-development';",
        'const PRECACHE_URLS = Object.freeze([]);',
        '/* GENERATED_PRECACHE_END */'
    ].join('\n'));
    return rootDir;
}

function readCacheName(rootDir) {
    const worker = fs.readFileSync(path.join(rootDir, 'public/service-worker.js'), 'utf8');
    return worker.match(/f1-guesser-static-[a-f0-9]{20}/)?.[0] || null;
}

test('static text asset versions are stable across LF and CRLF checkouts', () => {
    assert.equal(
        createStaticAssetVersion('public/js/app.js', Buffer.from('lineOne();\nlineTwo();\n')),
        createStaticAssetVersion('public/js/app.js', Buffer.from('lineOne();\r\nlineTwo();\r\n'))
    );
});

test('binary static asset versions continue to hash exact bytes', () => {
    assert.notEqual(
        createStaticAssetVersion('public/icons/icon.png', Buffer.from([0, 1, 2, 3])),
        createStaticAssetVersion('public/icons/icon.png', Buffer.from([0, 1, 2, 4]))
    );
});

test('service worker cache seed stays unchanged when only text line endings change', () => {
    const rootDir = createFixture();
    const options = {
        precacheStaticUrls: ['/js/app.js', '/icons/icon.png']
    };

    const firstResult = versionServiceWorker(rootDir, [], options);
    const firstCacheName = readCacheName(rootDir);
    assert.equal(firstResult.changed, true);
    assert.ok(firstCacheName);

    writeFile(rootDir, 'public/js/app.js', 'lineOne();\r\nlineTwo();\r\n');
    const secondResult = versionServiceWorker(rootDir, [], options);
    const secondCacheName = readCacheName(rootDir);

    assert.equal(secondResult.changed, false);
    assert.equal(secondCacheName, firstCacheName);

    writeFile(rootDir, 'public/icons/icon.png', Buffer.from([0, 1, 2, 4]));
    const thirdResult = versionServiceWorker(rootDir, [], options);
    const thirdCacheName = readCacheName(rootDir);

    assert.equal(thirdResult.changed, true);
    assert.notEqual(thirdCacheName, firstCacheName);
});
