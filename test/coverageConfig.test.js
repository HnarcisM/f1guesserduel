const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

test('coverage measures all application JavaScript and excludes test files', () => {
    const config = readJson('.c8rc.json');

    assert.equal(config.all, true);
    assert.deepEqual(config.include, [
        'server/**/*.js',
        'public/js/**/*.js',
        'scripts/*.js'
    ]);
    assert.ok(config.include.every((pattern) => !pattern.startsWith('test/')));
    assert.deepEqual(config.reporter, ['text-summary', 'json-summary']);
    assert.equal(config['reports-dir'], 'test-results/coverage');
    assert.equal(config['temp-directory'], 'test-results/coverage/tmp');
});

test('coverage thresholds protect every metric and run through the npm script', () => {
    const config = readJson('.c8rc.json');
    const packageJson = readJson('package.json');

    assert.equal(config['check-coverage'], true);
    assert.equal(config.statements, 65);
    assert.equal(config.branches, 70);
    assert.equal(config.functions, 75);
    assert.equal(config.lines, 65);
    assert.equal(
        packageJson.scripts['test:coverage'],
        'c8 node --test test/*.test.js test/regression/*.test.js'
    );
});
