const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { optimize } = require('svgo');

const {
    assertRootGeometryPreserved,
    collectSvgPaths,
    getRootAttribute,
    optimizeSvgFile
} = require('../scripts/optimize-svg-assets');

test('SVG optimizer removes editor metadata while preserving root geometry and ids', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-svg-optimize-'));
    const svgPath = path.join(rootDir, 'sample.svg');
    const source = `<?xml version="1.0"?>
<!-- editor comment -->
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" id="sample-root">
  <metadata>editor metadata</metadata>
  <defs><linearGradient id="paint"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
  <rect id="shape" x="0" y="0" width="640" height="480" fill="url(#paint)" />
</svg>`;
    fs.writeFileSync(svgPath, source, 'utf8');

    const result = optimizeSvgFile(svgPath, { relativePath: 'sample.svg' });
    const optimized = fs.readFileSync(svgPath, 'utf8');

    assert.equal(result.changed, true);
    assert.ok(result.savedBytes > 0);
    assert.equal(getRootAttribute(optimized, 'viewBox'), '0 0 640 480');
    assert.equal(getRootAttribute(optimized, 'width'), '640');
    assert.equal(getRootAttribute(optimized, 'height'), '480');
    assert.match(optimized, /id="paint"/);
    assert.match(optimized, /url\(#paint\)/);
    assert.equal(optimized.includes('editor metadata'), false);
    assert.equal(optimized.includes('editor comment'), false);
});

test('SVG geometry guard rejects removal of viewBox or intrinsic dimensions', () => {
    const before = '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 0h10v10z"/></svg>';

    assert.throws(
        () => assertRootGeometryPreserved(before, '<svg><path d="M0 0h10v10z"/></svg>', 'unsafe.svg'),
        /removed viewBox/
    );
});

test('SVG optimizer does not rewrite an asset when optimization is not smaller', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-svg-unchanged-'));
    const svgPath = path.join(rootDir, 'small.svg');
    const source = '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>\n';
    fs.writeFileSync(svgPath, source, 'utf8');

    const result = optimizeSvgFile(svgPath, {
        relativePath: 'small.svg',
        optimizeSvg() {
            return { data: `${source.trim()}<!--larger-->` };
        }
    });

    assert.equal(result.changed, false);
    assert.equal(result.savedBytes, 0);
    assert.equal(fs.readFileSync(svgPath, 'utf8'), source);
});

test('production SVG assets are parseable and contain no executable or remote references', () => {
    const rootDir = path.join(__dirname, '..');
    const svgPaths = collectSvgPaths(rootDir);
    const dangerousContent = /<script\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|javascript:|data:text\/html)|url\(\s*["']?https?:/i;

    assert.ok(svgPaths.length > 0);
    for (const relativePath of svgPaths) {
        const absolutePath = path.join(rootDir, relativePath);
        const source = fs.readFileSync(absolutePath, 'utf8');

        assert.doesNotThrow(() => optimize(source, {
            path: absolutePath,
            plugins: []
        }), relativePath);
        assert.equal(dangerousContent.test(source), false, relativePath);
        assert.ok(
            getRootAttribute(source, 'viewBox') !== null
                || (getRootAttribute(source, 'width') !== null && getRootAttribute(source, 'height') !== null),
            `${relativePath} must preserve viewBox or intrinsic dimensions.`
        );
    }
});
