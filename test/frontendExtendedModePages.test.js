const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const MODES = Object.freeze([
    { key: 'speed-run', path: '/modes/speed-run/', entry: 'speedRunPage.js' },
    { key: 'era', path: '/modes/era/', entry: 'eraPage.js' },
    { key: 'streak', path: '/modes/streak/', entry: 'streakPage.js' },
    { key: 'weekly', path: '/modes/weekly/', entry: 'weeklyPage.js' },
    { key: 'constructor', path: '/modes/constructor/', entry: 'constructorPage.js' },
    { key: 'pilot-sudoku', path: '/modes/pilot-sudoku/', entry: 'pilotSudokuPage.js' },
    { key: 'track', path: '/modes/track/', entry: 'trackPage.js' }
]);

test('every extended mode has a dedicated standalone HTML page', () => {
    for (const mode of MODES) {
        const relativePath = `public${mode.path}index.html`;
        assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`);
        const html = read(relativePath);
        assert.match(html, new RegExp(`data-extended-mode="${mode.key}"`));
        assert.match(html, /\/css\/24-extended-modes\.css/);
        assert.match(html, /\/css\/25-mode-pages\.css/);
        assert.match(html, new RegExp(`/js/modes/${mode.entry.replace('.', '\\.')}`));
        assert.match(html, /\/socket\.io\/socket\.io\.js/);
        assert.doesNotMatch(html, /game\.bundle\.min\.js|style\.bundle\.css|game\.js/);
    }
});

test('every standalone page has an independent entry module', () => {
    for (const mode of MODES) {
        const entryPath = `public/js/modes/${mode.entry}`;
        const entry = read(entryPath);
        assert.match(entry, /runExtendedModePage/);
        assert.match(entry, new RegExp(`runExtendedModePage\\('${mode.key}'\\)`));
        assert.doesNotMatch(entry, /gameModeController|startSingleGame|game\.bundle/);
    }
});

test('standalone page core validates routes and synchronizes account auth before starting', () => {
    const source = read('public/js/extendedModePage.js');
    for (const mode of MODES) {
        const escapedKey = mode.key.replace('-', '\\-');
        const escapedPath = mode.path.replaceAll('/', '\\/');
        assert.match(source, new RegExp(`['"]?${escapedKey}['"]?: '${escapedPath}'`));
    }
    assert.match(source, /authApi\.me\(\)/);
    assert.match(source, /refreshAuthUser/);
    assert.match(source, /await loadAuthenticatedUser/);
    assert.match(source, /await controller\.open/);
    assert.match(source, /replaceChildren\?\.\(panel\)/);
    assert.match(source, /setAttribute\('role', 'region'\)/);
});

test('standalone mode styling converts the modal shell into a full page surface', () => {
    const styles = read('public/css/25-mode-pages.css');
    assert.match(styles, /body\.extended-mode-page/);
    assert.match(styles, /\.extended-mode-page \.extended-mode-backdrop/);
    assert.match(styles, /display: none !important/);
    assert.match(styles, /\.extended-mode-page \.extended-mode-panel/);
    assert.match(styles, /position: relative/);
    assert.match(styles, /max-height: none/);
});
