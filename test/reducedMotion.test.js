const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const reducedMotionStylesheet = '/css/13-reduced-motion.css';

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function getStylesheetImports(stylesheetEntry) {
    return [...stylesheetEntry.matchAll(/@import\s+url\(["']([^"']+)["']\);/g)]
        .map(match => match[1].split('?')[0]);
}

test('stylesheets loaded after the global reduced-motion policy cannot reintroduce motion', () => {
    const stylesheetEntry = readProjectFile('public/style.css');
    const imports = getStylesheetImports(stylesheetEntry);
    const reducedMotionIndex = imports.indexOf(reducedMotionStylesheet);

    assert.notEqual(reducedMotionIndex, -1);
    assert.equal(imports.filter(pathname => pathname === reducedMotionStylesheet).length, 1);

    for (const stylesheetPath of imports.slice(reducedMotionIndex + 1)) {
        const css = readProjectFile(path.join('public', stylesheetPath));

        assert.doesNotMatch(
            css,
            /(?:^|[;{\s])(?:animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?|scroll-behavior)\s*:/im,
            `${stylesheetPath} reintroduces motion after ${reducedMotionStylesheet}`
        );
    }
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
