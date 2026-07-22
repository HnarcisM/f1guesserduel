const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listJavaScriptFiles(absolutePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
    });
}

function createProgressElement() {
    const classes = new Set();
    return {
        dataset: {},
        classList: {
            add(...names) {
                names.forEach(name => classes.add(name));
            },
            remove(...names) {
                names.forEach(name => classes.delete(name));
            },
            contains(name) {
                return classes.has(name);
            }
        }
    };
}

test('progress percentages are finite, clamped and rounded before becoming class names', async () => {
    const { normalizeProgressPercent } = await import('../public/js/progressStyle.js');

    assert.equal(normalizeProgressPercent(-12), 0);
    assert.equal(normalizeProgressPercent(16.67), 17);
    assert.equal(normalizeProgressPercent(101), 100);
    assert.equal(normalizeProgressPercent('50'), 50);
    assert.equal(normalizeProgressPercent('not-a-number'), 0);
});

test('progress rendering replaces only the previous bounded CSS class', async () => {
    const { setProgressPercent } = await import('../public/js/progressStyle.js');
    const element = createProgressElement();

    assert.equal(setProgressPercent(element, 24.6), 25);
    assert.equal(element.dataset.progressPercent, '25');
    assert.equal(element.classList.contains('has-progress-percent'), true);
    assert.equal(element.classList.contains('progress-percent-25'), true);

    assert.equal(setProgressPercent(element, 75), 75);
    assert.equal(element.classList.contains('progress-percent-25'), false);
    assert.equal(element.classList.contains('progress-percent-75'), true);
});

test('progress stylesheet exposes every allowed percentage exactly once', () => {
    const css = readProjectFile('public/css/13-progress-values.css');
    const matches = [...css.matchAll(/\.progress-percent-(\d+)\s*\{\s*--progress-percent:\s*(\d+)%/g)];

    assert.equal(matches.length, 101);
    matches.forEach((match, index) => {
        assert.equal(Number(match[1]), index);
        assert.equal(Number(match[2]), index);
    });
});

test('frontend runtime does not depend on inline style mutation', () => {
    const runtimeFiles = listJavaScriptFiles(path.join(projectRoot, 'public', 'js'));

    for (const absolutePath of runtimeFiles) {
        const relativePath = path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/');
        const source = fs.readFileSync(absolutePath, 'utf8');
        assert.doesNotMatch(source, /\.style(?:\.|\[|\s*=)/, `${relativePath} mutates inline styles`);
        assert.doesNotMatch(source, /setAttribute\(\s*['"]style['"]/, `${relativePath} sets a style attribute`);
    }

    const html = readProjectFile('public/index.html');
    assert.doesNotMatch(html, /\sstyle\s*=/i);
    assert.doesNotMatch(html, /<style(?:\s|>)/i);
});
