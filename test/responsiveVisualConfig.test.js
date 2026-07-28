const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { VIEWPORTS } = require('./e2e/responsiveVisualConfig');

test('responsive visual matrix covers phone, Galaxy Fold 5, laptop and desktop layouts', () => {
    assert.deepEqual(
        VIEWPORTS.map(viewport => viewport.label),
        [
            'phone-360',
            'fold5-cover',
            'fold5-inner-portrait',
            'fold5-inner-landscape',
            'laptop-1366',
            'desktop'
        ]
    );
    assert.ok(VIEWPORTS.every(viewport => viewport.width > 0 && viewport.height > 0));
    assert.ok(VIEWPORTS.some(viewport => viewport.label === 'fold5-inner-portrait' && viewport.width < viewport.height));
    assert.ok(VIEWPORTS.some(viewport => viewport.label === 'fold5-inner-landscape' && viewport.width > viewport.height));
});


test('Fold inner viewports receive the global Game Hub card-width fix', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css'),
        'utf8'
    );
    const foldInnerViewports = VIEWPORTS.filter(viewport => viewport.label.startsWith('fold5-inner-'));
    const fullWidthBlock = css.match(
        /GAME_HUB_STANDARD_CARD_FULL_WIDTH_FIX_START([\s\S]*?)GAME_HUB_STANDARD_CARD_FULL_WIDTH_FIX_END/
    );

    assert.equal(foldInnerViewports.length, 2);
    assert.ok(
        foldInnerViewports.every(viewport => viewport.width > 520),
        'Testul trebuie să acopere dimensiuni Fold care depășesc breakpoint-ul de telefon'
    );
    assert.ok(fullWidthBlock, 'Lipsește fixul global pentru cardurile standard Game Hub');
    assert.doesNotMatch(fullWidthBlock[1], /@media\s*\(/);
    assert.match(fullWidthBlock[1], /\.game-hub-card-chrome\s*\{[^}]*width:\s*100%/s);
    assert.match(fullWidthBlock[1], /\.game-hub-card-content\s*\{[^}]*width:\s*100%/s);
});

test('responsive E2E suite captures home and game states and checks horizontal overflow', () => {
    const source = fs.readFileSync(
        path.join(__dirname, 'e2e', 'responsiveVisual.e2e.test.js'),
        'utf8'
    );
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const dashboardSource = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'gameHubDashboardView.js'),
        'utf8'
    );

    assert.match(source, /page\.screenshot\(/);
    assert.match(source, /'home'/);
    assert.match(source, /'game'/);
    assert.match(source, /document\.documentElement\.scrollWidth/);
    assert.match(source, /document\.body\.scrollWidth/);
    assert.match(source, /assertNoVisibleOverlap/);
    assert.match(source, /compareWithBaseline/);
    assert.match(source, /assertGameHubSvgIcons/);
    assert.match(source, /assertGameHubPanelTitlesClearFixedHeader/);
    assert.match(source, /await assertGameHubPanelTitlesClearFixedHeader\(page, viewport\)/);
    assert.match(source, /assertStandardGameHubCardLayersFillWidth/);
    assert.match(source, /stabilizeHomeVisualState/);
    assert.match(source, /\.game-hub-card-art/);
    assert.match(source, /\.game-hub-featured-card\[data-game-variant=/);
    assert.match(source, /artworkReport\.artworkCount/);
    assert.doesNotMatch(source, /\.game-hub-mode-artwork/);
    assert.match(source, /captureState\(page, viewport, 'home',[^\n]+compareVisual:\s*false/);
    assert.match(source, /\.game-hub-summary-bar/);
    assert.match(dashboardSource, /game-hub-summary-bar/);
    assert.doesNotMatch(source, /\.game-hub-profile-bar/);
    assert.match(source, /UPDATE_VISUAL_BASELINES/);
    assert.match(source, /\.diff\.png/);
    assert.match(source, /const visualFailures = \[\]/);
    assert.match(source, /Regresii vizuale detectate/);
    assert.match(source, /visualFailures\.length/);
    assert.match(html, /id=["']menu-hamburger["']/);
    assert.match(source, /#menu-hamburger/);
    assert.doesNotMatch(source, /#menuToggle/);
});

test('Fold landscape uses a compact game grid below 921px', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', '11-mobile-layout-fix.css'),
        'utf8'
    );
    const landscapeRule = source.match(
        /@media \(min-width: 769px\) and \(max-width: 920px\) \{[\s\S]*?\/\* --- FOLD INNER HEADER OVERLAP FIX --- \*\//
    );

    assert.ok(landscapeRule, 'Lipsește breakpoint-ul pentru Fold landscape');
    assert.match(landscapeRule[0], /\.grid\s*\{/);
    assert.match(landscapeRule[0], /repeat\(3, minmax\(78px, 0\.85fr\)\)/);
    assert.match(landscapeRule[0], /overflow-x:\s*auto/);
    assert.match(landscapeRule[0], /\.cell\s*\{[\s\S]*?min-width:\s*0/);

    const foldLandscape = VIEWPORTS.find(viewport => viewport.label === 'fold5-inner-landscape');
    const bodyHorizontalPadding = 2 * 20;
    const minimumColumnsWidth = 34 + 118 + 95 + 110 + (3 * 78);
    const sixGridGaps = 6 * 5;
    const minimumGridWidth = minimumColumnsWidth + sixGridGaps;
    assert.ok(
        minimumGridWidth <= foldLandscape.width - bodyHorizontalPadding,
        `Grila minimă de ${minimumGridWidth}px nu încape în cei ${foldLandscape.width - bodyHorizontalPadding}px disponibili`
    );
});
