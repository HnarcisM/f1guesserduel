const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'keep-render-awake.yml');
const scriptPath = path.join(root, 'scripts', 'wake-render-service.js');

function readWorkflow() {
    return fs.readFileSync(workflowPath, 'utf8');
}

test('Render keep-alive runs automatically below the 15-minute idle window', () => {
    const source = readWorkflow();

    assert.match(source, /^name:\s*Keep Render Awake$/m);
    assert.match(source, /cron:\s*'3,13,23,33,43,53 \* \* \* \*'/);
    assert.match(source, /^\s{2}workflow_dispatch:\s*$/m);
    assert.match(source, /^permissions:\s*\n\s{2}contents:\s*read$/m);
    assert.match(source, /runs-on:\s*ubuntu-24\.04/);
    assert.match(source, /timeout-minutes:\s*5/);
});

test('Render keep-alive executes the repository script and supports a URL override', () => {
    const source = readWorkflow();

    assert.equal(fs.existsSync(scriptPath), true);
    assert.match(source, /uses:\s*actions\/checkout@v7/);
    assert.match(source, /uses:\s*actions\/setup-node@v7/);
    assert.match(source, /node-version:\s*'22\.x'/);
    assert.match(source, /name:\s*Wake Render and validate health/);
    assert.match(source, /vars\.RENDER_HEALTH_URL/);
    assert.match(source, /https:\/\/f1guesserduel\.onrender\.com\/api\/health/);
    assert.match(source, /run:\s*node scripts\/wake-render-service\.js/);
    assert.doesNotMatch(source, /Wake Render and validate Redis/);
});
