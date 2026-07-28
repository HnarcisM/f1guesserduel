const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dashboardCssPath = path.join(__dirname, '..', 'public', 'css', '29-game-hub-dashboard.css');
const polishCssPath = path.join(__dirname, '..', 'public', 'css', '30-game-hub-visual-polish.css');

function readCss(filePath = dashboardCssPath) {
    return fs.readFileSync(filePath, 'utf8');
}

test('Game Hub resets both legacy catalog width constraints with a viewport-fluid shell', () => {
    const css = readCss();

    assert.match(css, /\.game-mode-selection\.game-hub\s*\{[\s\S]*?max-width:\s*none/);
    assert.match(css, /\.overlay\s*>\s*\.menu-container\.game-hub-menu\s*\{/);
    assert.match(css, /width:\s*min\(1600px,\s*calc\(100vw\s*-\s*32px\)\)/);
    assert.match(css, /\.overlay\s*>\s*\.menu-container\.game-hub-menu\s*\{[\s\S]*?max-width:\s*none/);
});

test('Game Hub provides desktop, laptop and mobile dashboard arrangements', () => {
    const css = readCss();

    assert.match(css, /grid-template-areas:\s*"single duel specialty"/);
    assert.match(css, /@media\s*\(max-width:\s*1180px\)/);
    assert.match(css, /"duel duel"\s*"single specialty"/);
    assert.match(css, /@media\s*\(max-width:\s*820px\)/);
    assert.match(css, /"duel"\s*"single"\s*"specialty"/);
});

test('Game Hub cards collapse inside narrow panels instead of clipping text', () => {
    const css = readCss();

    assert.match(css, /container-type:\s*inline-size/);
    assert.match(css, /@container\s*\(max-width:\s*430px\)/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('phone and Fold Game Hub reserve the fixed header area before rendering panel titles', () => {
    const css = readCss(polishCssPath);
    const mobileRule = css.match(
        /@media \(max-width:\s*920px\) \{[\s\S]*?#difficulty-overlay:has\(#gameHubCatalogView:not\(\.is-hidden\)\) \{[\s\S]*?overscroll-behavior-y:\s*contain;[\s\S]*?\n\}/
    );

    assert.ok(mobileRule, 'Lipsește protecția comună pentru telefon și Fold');
    assert.match(mobileRule[0], /align-items:\s*flex-start/);
    assert.match(mobileRule[0], /height:\s*100dvh/);
    assert.match(mobileRule[0], /padding-top:\s*var\(--game-hub-header-clearance\)/);
    assert.match(mobileRule[0], /scroll-padding-top:\s*var\(--game-hub-header-clearance\)/);
    assert.match(css, /--game-hub-header-clearance:\s*calc\(var\(--header-height\) \+ env\(safe-area-inset-top, 0px\) \+ 12px\)/);
    assert.match(css, /#difficulty-overlay:has\(#gameHubCatalogView:not\(\.is-hidden\)\) > \.menu-container\.game-hub-menu \{[\s\S]*?margin-top:\s*0/);
});
