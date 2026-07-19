const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

function readWorkflow() {
    return fs.readFileSync(workflowPath, 'utf8');
}

test('GitHub Actions CI runs for pushes and pull requests with minimal permissions', () => {
    const source = readWorkflow();

    assert.match(source, /^name:\s*CI$/m);
    assert.match(source, /^on:\s*\n\s+push:\s*\n\s+pull_request:/m);
    assert.match(source, /^permissions:\s*\n\s+contents:\s*read$/m);
    assert.match(source, /cancel-in-progress:\s*true/);
    assert.match(source, /timeout-minutes:\s*15/);
});

test('GitHub Actions CI uses Node 22 and the locked npm dependencies', () => {
    const source = readWorkflow();

    assert.match(source, /uses:\s*actions\/checkout@v7/);
    assert.match(source, /uses:\s*actions\/setup-node@v7/);
    assert.match(source, /node-version:\s*['"]22\.x['"]/);
    assert.match(source, /cache:\s*npm/);
    assert.match(source, /run:\s*npm ci/);
});

test('GitHub Actions CI tests, builds and rejects stale generated frontend files', () => {
    const source = readWorkflow();
    const testPosition = source.indexOf('run: npm test');
    const buildPosition = source.indexOf('run: npm run build');
    const generatedCheckPosition = source.indexOf(
        'git diff --exit-code -- public/index.html public/style.bundle.css public/game.bundle.min.js'
    );

    assert.ok(testPosition >= 0);
    assert.ok(buildPosition > testPosition);
    assert.ok(generatedCheckPosition > buildPosition);
});

test('GitHub Actions CI runs responsive browser tests and retains visual artifacts', () => {
    const source = readWorkflow();

    assert.match(source, /^\s{2}responsive-visual:$/m);
    assert.match(source, /needs:\s*verify/);
    assert.match(source, /npx playwright install --with-deps chromium/);
    assert.match(source, /run:\s*npm run test:e2e:responsive/);
    assert.match(source, /uses:\s*actions\/upload-artifact@v7/);
    assert.match(source, /if:\s*always\(\)/);
    assert.match(source, /path:\s*test-results\/responsive-visual\//);
});
