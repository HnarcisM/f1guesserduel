const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');
const preflightPath = path.join(root, 'scripts', 'run-ci-preflight.js');
const pythonHelperPath = path.join(root, 'scripts', 'ci_backend_tests.py');
const pythonTestPath = path.join(root, 'test', 'ci_backend_tests_test.py');

function readWorkflow() {
    return fs.readFileSync(workflowPath, 'utf8');
}

test('GitHub Actions CI runs for pushes and pull requests with minimal permissions', () => {
    const source = readWorkflow();

    assert.match(source, /^name:\s*CI$/m);
    assert.match(source, /^on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]\s*\n\s+pull_request:\s*\n\s+workflow_dispatch:/m);
    assert.match(source, /^permissions:\s*\n\s+contents:\s*read$/m);
    assert.match(source, /cancel-in-progress:\s*true/);
    assert.match(source, /timeout-minutes:\s*15/);
    assert.doesNotMatch(source, /runs-on:\s*ubuntu-latest/);
    assert.equal((source.match(/runs-on:\s*ubuntu-24\.04/g) || []).length, 4);
});

test('GitHub Actions CI uses locked Node dependencies and an explicit Python runtime', () => {
    const source = readWorkflow();

    assert.match(source, /uses:\s*actions\/checkout@v7/);
    assert.match(source, /uses:\s*actions\/setup-node@v7/);
    assert.match(source, /node-version:\s*['"]22\.x['"]/);
    assert.match(source, /cache:\s*npm/);
    assert.match(source, /uses:\s*actions\/setup-python@v6/);
    assert.match(source, /python-version:\s*['"]3\.13['"]/);
    assert.equal((source.match(/name:\s*Verify package-lock integrity/g) || []).length, 3);
    assert.equal((source.match(/run:\s*node scripts\/verify-package-lock-integrity\.js/g) || []).length, 3);
    assert.match(source, /run:\s*npm ci/);

    const integrityChecks = [...source.matchAll(/name:\s*Verify package-lock integrity[\s\S]*?run:\s*node scripts\/verify-package-lock-integrity\.js[\s\S]*?name:\s*Install dependencies[\s\S]*?run:\s*npm ci/g)];
    assert.equal(integrityChecks.length, 3);
});

test('GitHub Actions delegates the required test-and-build job to the canonical local command', () => {
    const source = readWorkflow();
    const verifyJob = source.split(/^  integration-services:$/m)[0];

    assert.match(verifyJob, /name:\s*Run canonical CI verification\s*\n\s*run:\s*npm run ci:verify/);
    assert.equal((verifyJob.match(/npm run ci:verify/g) || []).length, 1);
    assert.doesNotMatch(verifyJob, /run:\s*npm run test:coverage/);
    assert.doesNotMatch(verifyJob, /run:\s*npm run build/);
    assert.doesNotMatch(verifyJob, /git diff --exit-code -- public\/index\.html/);
    assert.doesNotMatch(verifyJob, /name:\s*Enforce backend test result/);
});

test('GitHub Actions CI retains backend logs and the machine-readable coverage summary', () => {
    const source = readWorkflow();

    assert.match(source, /name:\s*backend-test-log-\$\{\{ github\.run_attempt \}\}/);
    assert.match(source, /path:\s*test-results\/ci\/backend-tests\.log/);
    assert.match(source, /name:\s*coverage-\$\{\{ github\.run_attempt \}\}/);
    assert.match(source, /test-results\/coverage\/coverage-summary\.json/);
    assert.match(source, /if-no-files-found:\s*error/);
    assert.match(source, /retention-days:\s*14/);
});

test('canonical verification preserves Python diagnostics and propagates backend failures directly', () => {
    const preflightSource = fs.readFileSync(preflightPath, 'utf8');
    const helperSource = fs.readFileSync(pythonHelperPath, 'utf8');
    const testSource = fs.readFileSync(pythonTestPath, 'utf8');

    assert.match(preflightSource, /scripts\/ci_backend_tests\.py/);
    assert.match(preflightSource, /--propagate-exit-code/);
    assert.match(preflightSource, /GITHUB_STEP_SUMMARY/);
    assert.match(preflightSource, /BACKEND_LOG_FILE/);
    assert.match(helperSource, /subprocess\.Popen/);
    assert.match(helperSource, /GITHUB_OUTPUT/);
    assert.match(helperSource, /GITHUB_STEP_SUMMARY/);
    assert.match(helperSource, /propagate_exit_code/);
    assert.match(helperSource, /FAILURE_MARKER = "✖ failing tests:"/);
    assert.doesNotMatch(helperSource, /import (requests|yaml|click|pytest)/);
    assert.match(testSource, /class CiBackendTestsScriptTest\(unittest\.TestCase\)/);
    assert.match(testSource, /test_run_command_streams_output_and_records_original_exit_code/);
    assert.match(testSource, /test_run_subcommand_optionally_propagates_original_exit_code/);
    assert.match(testSource, /test_failure_summary_keeps_totals_and_failed_test_section/);
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

test('GitHub Actions CI runs every browser suite, retains logs and enforces failures at the end', () => {
    const source = readWorkflow();

    assert.match(source, /^\s{2}responsive-visual:$/m);
    assert.match(source, /needs:\s*\[verify, integration-services\]/);
    assert.match(source, /npx playwright install --with-deps chromium/);
    assert.equal((source.match(/continue-on-error:\s*true/g) || []).length, 4);
    assert.match(source, /id:\s*responsive_tests/);
    assert.match(source, /id:\s*flow_tests/);
    assert.match(source, /id:\s*admin_tests/);
    assert.match(source, /id:\s*accessibility_tests/);
    assert.match(source, /npm run test:e2e:responsive 2>&1 \| tee test-results\/browser-logs\/responsive-visual\.log/);
    assert.match(source, /npm run test:e2e:flows 2>&1 \| tee test-results\/browser-logs\/profile-reconnection\.log/);
    assert.match(source, /npm run test:e2e:admin 2>&1 \| tee test-results\/browser-logs\/admin-console\.log/);
    assert.match(source, /npm run test:e2e:accessibility 2>&1 \| tee test-results\/browser-logs\/accessibility\.log/);
    assert.match(source, /name:\s*Publish browser test summary/);
    assert.match(source, /name:\s*Enforce browser test results/);
    assert.match(source, /steps\.responsive_tests\.outcome/);
    assert.match(source, /steps\.flow_tests\.outcome/);
    assert.match(source, /steps\.admin_tests\.outcome/);
    assert.match(source, /steps\.accessibility_tests\.outcome/);
    assert.match(source, /test-results\/browser-logs\//);
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

test('canonical verification rejects stale committed frontend artifacts including the service worker', () => {
    const source = readWorkflow();
    const preflightSource = fs.readFileSync(preflightPath, 'utf8');

    assert.match(source, /run:\s*npm run ci:verify/);
    assert.match(preflightSource, /public\/index\.html/);
    assert.match(preflightSource, /public\/style\.bundle\.css/);
    assert.match(preflightSource, /public\/game\.bundle\.min\.js/);
    assert.match(preflightSource, /public\/service-worker\.js/);
    assert.match(preflightSource, /args:\s*\['diff', '--exit-code', '--', \.\.\.GENERATED_FILES\]/);
});

test('GitHub Actions exposes one stable final CI gate for branch protection', () => {
    const source = readWorkflow();
    const gate = source.split(/^  ci-gate:$/m)[1] || '';

    assert.match(source, /^  ci-gate:$/m);
    assert.match(gate, /name:\s*CI Gate/);
    assert.match(gate, /if:\s*always\(\)/);
    assert.match(gate, /needs:\s*\[verify, integration-services, responsive-visual\]/);
    assert.match(gate, /VERIFY_RESULT:\s*\$\{\{ needs\.verify\.result \}\}/);
    assert.match(gate, /INTEGRATION_RESULT:\s*\$\{\{ needs\.integration-services\.result \}\}/);
    assert.match(gate, /BROWSER_RESULT:\s*\$\{\{ needs\.responsive-visual\.result \}\}/);
    assert.match(gate, /name:\s*Publish final CI summary/);
    assert.match(gate, /name:\s*Enforce required CI jobs/);
    assert.match(gate, /CI gate failed/);
});
