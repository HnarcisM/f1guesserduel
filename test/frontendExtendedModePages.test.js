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

test('speed run reuses the Classic header, profile and feedback settings controls', () => {
    const html = read('public/modes/speed-run/index.html');

    assert.match(html, /class="site-header mode-page-site-header"/);
    assert.match(html, /id="menu-hamburger"/);
    assert.match(html, /id="dropdown-menu"/);
    assert.match(html, /id="siteHomeControl"/);
    assert.match(html, /id="authOpenBtn" class="auth-open-btn"/);
    assert.match(html, /id="feedbackSettingsBtn"/);
    assert.match(html, /id="feedbackSettingsPanel"/);
    assert.match(html, /\/js\/themeBootstrap\.js/);
    assert.match(html, /\/css\/01-theme-tokens\.css/);
    assert.match(html, /\/css\/02-header-menu\.css/);
    assert.match(html, /\/css\/08-auth\.css/);
    assert.match(html, /\/css\/11-mobile-layout-fix\.css/);
    assert.match(html, /\/css\/13-progress-values\.css/);
    assert.match(html, /\/css\/14-auth-panel-viewport-fix\.css/);
    assert.match(html, /\/css\/19-account-game-history\.css/);
    assert.match(html, /\/css\/21-feedback-settings\.css/);
    assert.match(html, /id="authBackdrop"/);
    assert.match(html, /id="authPanel"[^>]*role="dialog"/);
    assert.match(html, /id="authAccountView"/);
    assert.match(html, /id="authGameHistory"/);
    assert.match(html, /\/js\/feedbackController\.js/);
    assert.match(html, /\/js\/accountGameHistoryController\.js/);
    assert.ok(
        html.indexOf('/css/25-mode-pages.css') < html.indexOf('/css/01-theme-tokens.css'),
        'Classic theme tokens must load after the standalone fallback tokens'
    );
    assert.doesNotMatch(html, /shareRoomBtn|duelStatus|roomBtnText/);
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
    const header = read('public/js/extendedModeHeaderController.js');
    for (const mode of MODES) {
        const escapedKey = mode.key.replace('-', '\\-');
        const escapedPath = mode.path.replaceAll('/', '\\/');
        assert.match(source, new RegExp(`['"]?${escapedKey}['"]?: '${escapedPath}'`));
    }
    assert.match(source, /authApi\.me\(\)/);
    assert.match(source, /createAuthView/);
    assert.match(source, /setupEmbeddedAuth/);
    assert.match(source, /refreshAuthUser/);
    assert.match(source, /await setupEmbeddedAuth/);
    assert.match(source, /await loadAuthenticatedUser/);
    assert.match(source, /await controller\.open/);
    assert.match(source, /replaceChildren\?\.\(panel\)/);
    assert.match(source, /setAttribute\('role', 'region'\)/);
    assert.match(source, /extendedModeHeaderController/);
    assert.match(source, /installPageNavigation/);
    assert.match(header, /setupThemeMenu\(menu\)/);
    assert.match(header, /setNavigationMenuOpen/);
    assert.match(header, /querySelectorAll\('\[data-mode-path\]'\)/);
    assert.match(header, /getElementById\('authPanel'\)/);
    assert.match(header, /profileButton && !embeddedProfilePanel/);
    assert.match(header, /f1-mode-return-path/);
    assert.match(header, /location\.assign\('\/#login'\)/);
});

test('standalone header controller is included in the offline precache manifest', () => {
    const versioning = read('scripts/version-frontend-assets.js');
    assert.match(versioning, /\/js\/extendedModeHeaderController\.js/);
});

test('standalone mode styling converts the modal shell into a full page surface', () => {
    const styles = read('public/css/25-mode-pages.css');
    assert.match(styles, /body\.extended-mode-page/);
    assert.match(styles, /\.extended-mode-page \.extended-mode-backdrop/);
    assert.match(styles, /display: none !important/);
    assert.match(styles, /\.extended-mode-page \.extended-mode-panel/);
    assert.match(styles, /position: relative/);
    assert.match(styles, /max-height: none/);
    assert.match(styles, /body\.extended-mode-page\.mode-page-classic-shell/);
    assert.match(styles, /padding: var\(--header-height\) 0 0/);
    assert.match(styles, /background: var\(--bg-gradient\)/);

    const authViewportStyles = read('public/css/14-auth-panel-viewport-fix.css');
    assert.match(authViewportStyles, /body\.extended-mode-page \.auth-panel/);
    assert.match(authViewportStyles, /body\.extended-mode-page \.auth-panel\.show/);
});
