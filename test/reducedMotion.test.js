const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('global reduced-motion policy is loaded after every component stylesheet', () => {
    const stylesheetEntry = readProjectFile('public/style.css');
    const imports = [...stylesheetEntry.matchAll(/@import\s+url\(["']([^"']+)["']\);/g)]
        .map(match => match[1].split('?')[0]);

    assert.equal(imports.at(-1), '/css/13-reduced-motion.css');
    assert.equal(imports.filter(pathname => pathname === '/css/13-reduced-motion.css').length, 1);
});

test('global reduced-motion policy neutralizes animations, transitions and smooth scrolling', () => {
    const css = readProjectFile('public/css/13-reduced-motion.css');

    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{/);
    assert.match(css, /animation-delay:\s*0ms\s*!important/);
    assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
    assert.match(css, /animation-iteration-count:\s*1\s*!important/);
    assert.match(css, /transition-delay:\s*0ms\s*!important/);
    assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
    assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});

test('production CSS bundle contains the global reduced-motion policy', () => {
    const bundle = readProjectFile('public/style.bundle.css');

    assert.match(bundle, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(bundle, /animation-duration:\.01ms!important/);
    assert.match(bundle, /animation-iteration-count:1!important/);
    assert.match(bundle, /transition-duration:\.01ms!important/);
    assert.match(bundle, /scroll-behavior:auto!important/);
});
