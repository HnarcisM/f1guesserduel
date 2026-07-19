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

    assert.match(source, /page\.screenshot\(/);
    assert.match(source, /'home'/);
    assert.match(source, /'game'/);
    assert.match(source, /document\.documentElement\.scrollWidth/);
    assert.match(source, /document\.body\.scrollWidth/);
    assert.match(source, /assertNoVisibleOverlap/);
});
