const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Dependabot monitors npm and GitHub Actions on a bounded weekly schedule', () => {
    const source = read('.github/dependabot.yml');

    assert.match(source, /^version:\s*2$/m);
    assert.equal((source.match(/package-ecosystem:/g) || []).length, 2);
    assert.match(source, /package-ecosystem:\s*npm/);
    assert.match(source, /package-ecosystem:\s*github-actions/);
    assert.equal((source.match(/directory:\s*\/$/gm) || []).length, 2);
    assert.equal((source.match(/interval:\s*weekly/g) || []).length, 2);
    assert.equal((source.match(/timezone:\s*Europe\/Bucharest/g) || []).length, 2);
    assert.equal((source.match(/open-pull-requests-limit:\s*5/g) || []).length, 2);
});

test('security workflow runs CodeQL with least privilege and dependency review on pull requests', () => {
    const source = read('.github/workflows/security.yml');

    assert.match(source, /^name:\s*Security$/m);
    assert.match(source, /^on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/m);
    assert.match(source, /pull_request:\s*\n\s+branches:\s*\[main\]/);
    assert.match(source, /schedule:\s*\n\s+- cron:/);
    assert.match(source, /workflow_dispatch:/);
    assert.match(source, /^permissions:\s*\n\s+contents:\s*read$/m);
    assert.doesNotMatch(source, /pull_request_target/);

    assert.match(source, /name:\s*Dependency review/);
    assert.match(source, /if:\s*github\.event_name == 'pull_request'/);
    assert.match(source, /uses:\s*actions\/dependency-review-action@v4/);
    assert.match(source, /fail-on-severity:\s*high/);
    assert.match(source, /fail-on-scopes:\s*runtime, development/);

    assert.match(source, /name:\s*CodeQL JavaScript and TypeScript/);
    assert.match(source, /security-events:\s*write/);
    assert.match(source, /actions:\s*read/);
    assert.match(source, /uses:\s*github\/codeql-action\/init@v4/);
    assert.match(source, /languages:\s*javascript-typescript/);
    assert.match(source, /queries:\s*security-extended/);
    assert.match(source, /uses:\s*github\/codeql-action\/analyze@v4/);
});

test('supply-chain workflows use the repository checkout major and fixed runner image', () => {
    const source = read('.github/workflows/security.yml');

    assert.equal((source.match(/uses:\s*actions\/checkout@v7/g) || []).length, 2);
    assert.equal((source.match(/runs-on:\s*ubuntu-24\.04/g) || []).length, 2);
    assert.doesNotMatch(source, /runs-on:\s*ubuntu-latest/);
});
