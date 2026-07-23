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
    assert.match(source, /^on:\s*\n\s+push:\s*\n\s+pull_request:\s*\n\s+workflow_dispatch:/m);
    assert.match(source, /^permissions:\s*\n\s+contents:\s*read$/m);
    assert.match(source, /cancel-in-progress:\s*true/);
    assert.match(source, /timeout-minutes:\s*15/);
    assert.doesNotMatch(source, /runs-on:\s*ubuntu-latest/);
    assert.equal((source.match(/runs-on:\s*ubuntu-24\.04/g) || []).length, 3);
});

test('GitHub Actions CI uses Node 22 and the locked npm dependencies', () => {
    const source = readWorkflow();

    assert.match(source, /uses:\s*actions\/checkout@v7/);
    assert.match(source, /uses:\s*actions\/setup-node@v7/);
    assert.match(source, /node-version:\s*['"]22\.x['"]/);
    assert.match(source, /cache:\s*npm/);
    assert.match(source, /run:\s*npm ci/);
});

test('GitHub Actions CI enforces coverage, builds and rejects stale generated frontend files', () => {
    const source = readWorkflow();
    const coveragePosition = source.indexOf('npm run test:coverage 2>&1 | tee');
    const enforcementPosition = source.indexOf('name: Enforce backend test result');
    const buildPosition = source.indexOf('run: npm run build');
    const generatedCheckPosition = source.indexOf(
        'git diff --exit-code -- public/index.html public/style.bundle.css public/game.bundle.min.js'
    );

    assert.ok(coveragePosition >= 0);
    assert.ok(enforcementPosition > coveragePosition);
    assert.ok(buildPosition > enforcementPosition);
    assert.ok(generatedCheckPosition > buildPosition);
});

test('GitHub Actions CI retains the machine-readable coverage summary', () => {
    const source = readWorkflow();

    assert.match(source, /name:\s*coverage-\$\{\{ github\.run_attempt \}\}/);
    assert.match(source, /test-results\/coverage\/coverage-summary\.json/);
    assert.match(source, /if-no-files-found:\s*error/);
    assert.match(source, /retention-days:\s*14/);
});

test('GitHub Actions CI preserves backend test logs and publishes failed tests in the job summary', () => {
    const source = readWorkflow();

    assert.match(source, /id:\s*backend_tests/);
    assert.match(source, /npm run test:coverage 2>&1 \| tee test-results\/ci\/backend-tests\.log/);
    assert.match(source, /test_exit_code=\$\{PIPESTATUS\[0\]\}/);
    assert.match(source, /GITHUB_STEP_SUMMARY/);
    assert.ok(source.includes("grep -q '^✖ failing tests:'"));
    assert.ok(source.includes("awk '/^✖ failing tests:/{show=1} show{print}'"));
    assert.ok(source.includes('tail -n 100 "$log_file"'));
    assert.match(source, /name:\s*backend-test-log-\$\{\{ github\.run_attempt \}\}/);
    assert.match(source, /path:\s*test-results\/ci\/backend-tests\.log/);
    assert.match(source, /TEST_EXIT_CODE:\s*\$\{\{ steps\.backend_tests\.outputs\.exit_code \}\}/);
    assert.match(source, /Backend tests failed/);
    assert.ok(source.includes('exit "${TEST_EXIT_CODE:-1}"'));
});

test('GitHub Actions CI provisions healthy Redis and PostgreSQL services', () => {
    const source = readWorkflow();

    assert.match(source, /^\s{2}integration-services:$/m);
    assert.match(source, /image:\s*redis:7\.4-alpine/);
    assert.match(source, /health-cmd "redis-cli ping"/);
    assert.match(source, /image:\s*postgres:17-alpine/);
    assert.match(source, /health-cmd "pg_isready -U f1guesser_ci -d f1guesser_ci"/);
    assert.match(source, /TEST_REDIS_URL:\s*redis:\/\/127\.0\.0\.1:6379/);
    assert.match(source, /TEST_DATABASE_URL:\s*postgresql:\/\/f1guesser_ci:[^@]+@127\.0\.0\.1:5432\/f1guesser_ci/);
    assert.match(source, /run:\s*npm run test:integration:services/);
});

test('GitHub Actions CI runs responsive and accessibility browser tests and retains reports', () => {
    const source = readWorkflow();

    assert.match(source, /^\s{2}responsive-visual:$/m);
    assert.match(source, /needs:\s*\[verify, integration-services\]/);
    assert.match(source, /npx playwright install --with-deps chromium/);
    assert.match(source, /run:\s*npm run test:e2e:responsive/);
    assert.match(source, /run:\s*npm run test:e2e:flows/);
    assert.match(source, /run:\s*npm run test:e2e:accessibility/);
    assert.match(source, /uses:\s*actions\/upload-artifact@v7/);
    assert.match(source, /if:\s*always\(\)/);
    assert.match(source, /test-results\/responsive-visual\//);
    assert.match(source, /test-results\/accessibility\//);
});

test('GitHub Actions CI regenerates visual baselines only through an explicit manual input', () => {
    const source = readWorkflow();

    assert.match(source, /update_visual_baselines:/);
    assert.match(source, /type:\s*boolean/);
    assert.match(
        source,
        /UPDATE_VISUAL_BASELINES:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.update_visual_baselines && '1' \|\| '0' \}\}/
    );
    assert.match(source, /name:\s*visual-baselines-\$\{\{ github\.run_attempt \}\}/);
    assert.match(source, /path:\s*test\/e2e\/baselines\/responsive-visual\//);
});
