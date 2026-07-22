const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { VIEWPORTS } = require('./e2e/responsiveVisualConfig');

test('responsive visual matrix covers phone, Galaxy Fold 5 and desktop layouts', () => {
    assert.deepEqual(
        VIEWPORTS.map(viewport => viewport.label),
        [
            'phone-360',
            'fold5-cover',
            'fold5-inner-portrait',
            'fold5-inner-landscape',
            'desktop'
        ]
    );
    assert.ok(VIEWPORTS.every(viewport => viewport.width > 0 && viewport.height > 0));
    assert.ok(VIEWPORTS.some(viewport => viewport.label === 'fold5-inner-portrait' && viewport.width < viewport.height));
    assert.ok(VIEWPORTS.some(viewport => viewport.label === 'fold5-inner-landscape' && viewport.width > viewport.height));
});

test('responsive E2E suite captures home and game states and checks horizontal overflow', () => {
    const source = fs.readFileSync(
        path.join(__dirname, 'e2e', 'responsiveVisual.e2e.test.js'),
        'utf8'
    );
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

    assert.match(source, /page\.screenshot\(/);
    assert.match(source, /'home'/);
    assert.match(source, /'game'/);
    assert.match(source, /document\.documentElement\.scrollWidth/);
    assert.match(source, /document\.body\.scrollWidth/);
    assert.match(source, /assertNoVisibleOverlap/);
    assert.match(source, /compareWithBaseline/);
    assert.match(source, /UPDATE_VISUAL_BASELINES/);
    assert.match(source, /\.diff\.png/);
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
