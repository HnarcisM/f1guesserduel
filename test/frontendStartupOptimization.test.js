'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const projectRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function normalizeCssImport(importUrl) {
    return String(importUrl || '')
        .replace(/^url\((.*)\)$/i, '$1')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .split('?')[0];
}

function parseBundledCssImports(cssContent) {
    return [...cssContent.matchAll(/@import\s+(?:url\()?['"]?([^'";)]+)['"]?\)?\s*;/gi)]
        .map(match => normalizeCssImport(match[1]));
}

function getLocalStartupAssets(htmlContent) {
    const references = [...htmlContent.matchAll(/<(?:link[^>]+href|script[^>]+src)="([^"]+)"/g)]
        .map(match => match[1])
        .map(url => url.split('?')[0])
        .filter(url => url.endsWith('.css') || url.endsWith('.js'))
        .filter(url => !url.startsWith('/socket.io/'));

    return references.map(url => {
        const absolutePath = path.join(projectRoot, 'public', url.replace(/^\/+/, ''));
        assert.equal(fs.existsSync(absolutePath), true, `${url} must resolve to a local startup asset`);
        const content = fs.readFileSync(absolutePath);
        return {
            url,
            bytes: content.length,
            gzipBytes: zlib.gzipSync(content, { level: zlib.constants.Z_BEST_COMPRESSION }).length
        };
    });
}

test('production HTML never reloads CSS modules already embedded in style.bundle.css', () => {
    const html = read('public/index.html');
    const bundledImports = new Set(parseBundledCssImports(read('public/style.css')));
    const linkedStylesheets = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^" ]*)?">/g)]
        .map(match => match[1]);
    const duplicates = linkedStylesheets.filter(href => bundledImports.has(href));

    assert.deepEqual(duplicates, []);
    assert.equal(linkedStylesheets.filter(href => href === '/style.bundle.css').length, 1);
});

test('main-page local CSS and JavaScript startup payload stays within the optimized budget', () => {
    const assets = getLocalStartupAssets(read('public/index.html'));
    const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
    const totalGzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);

    assert.ok(assets.length <= 26, `Startup uses ${assets.length} local CSS/JS requests; maximum is 26`);
    assert.ok(totalBytes <= 460_000, `Startup raw payload is ${totalBytes} bytes; maximum is 460000`);
    assert.ok(totalGzipBytes <= 110_000, `Startup gzip payload is ${totalGzipBytes} bytes; maximum is 110000`);
});

test('removed duplicate CSS modules remain source-owned by the canonical style bundle', () => {
    const imports = new Set(parseBundledCssImports(read('public/style.css')));
    for (const cssPath of [
        '/css/02-header-menu.css',
        '/css/08-auth.css',
        '/css/11-mobile-layout-fix.css',
        '/css/14-auth-panel-viewport-fix.css'
    ]) {
        assert.ok(imports.has(cssPath), `${cssPath} must remain included in style.bundle.css sources`);
        assert.equal(read('public/index.html').includes(cssPath), false, `${cssPath} must not be loaded twice`);
    }
});


test('precache and versioning use only the production Game Hub bundle', () => {
    const { DEFAULT_ASSETS, DEFAULT_PRECACHE_STATIC_URLS } = require('../scripts/version-frontend-assets');
    const versionedPaths = new Set(DEFAULT_ASSETS.map(asset => asset.publicPath));

    assert.ok(versionedPaths.has('/game-hub.bundle.js'));
    for (const sourcePath of [
        '/js/gameVariantRegistry.js',
        '/js/gameHubViewCore.js',
        '/js/gameHubProfileView.js',
        '/js/gameHubDuelRoomView.js',
        '/js/gameHubCardsView.js',
        '/js/gameHubDashboardView.js',
        '/js/gameHubController.js'
    ]) assert.equal(versionedPaths.has(sourcePath), false, `${sourcePath} must not be a production startup asset`);

    for (const cssPath of [
        '/css/02-header-menu.css',
        '/css/08-auth.css',
        '/css/11-mobile-layout-fix.css',
        '/css/14-auth-panel-viewport-fix.css'
    ]) assert.equal(DEFAULT_PRECACHE_STATIC_URLS.includes(cssPath), false, `${cssPath} must not be precached separately`);
});
