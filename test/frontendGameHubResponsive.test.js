const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const cssPath = path.join(__dirname, '..', 'public', 'css', '29-game-hub-dashboard.css');

function readCss() {
    return fs.readFileSync(cssPath, 'utf8');
}

test('Game Hub overrides the legacy 700px menu width with a viewport-fluid shell', () => {
    const css = readCss();

    assert.match(css, /\.overlay\s*>\s*\.menu-container\.game-hub-menu\s*\{/);
    assert.match(css, /width:\s*min\(1600px,\s*calc\(100vw\s*-\s*32px\)\)/);
    assert.match(css, /max-width:\s*none/);
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
