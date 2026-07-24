const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    GENERATED_FILES,
    buildSteps,
    parseArguments,
    resolvePythonCommand
} = require('../scripts/run-ci-preflight');

const packageJson = require('../package.json');

test('CI preflight mirrors Python validation, build, coverage and all browser quality suites', () => {
    const steps = buildSteps({ platform: 'linux', env: {} });
    const commands = steps.map(step => [step.command, ...step.args].join(' '));

    assert.ok(commands.some(command => command === 'python test/ci_backend_tests_test.py'));
    assert.ok(commands.some(command => command.endsWith('npm run build')));
    assert.ok(commands.some(command => command.includes('run test:coverage')));
    assert.ok(commands.some(command => command.includes('run test:e2e:responsive')));
    assert.ok(commands.some(command => command.includes('run test:e2e:flows')));
    assert.ok(commands.some(command => command.includes('run test:e2e:accessibility')));
    assert.ok(commands.some(command => command === 'git diff --check'));
    assert.deepEqual(steps.at(-1).args, ['diff', '--exit-code', '--', ...GENERATED_FILES]);
});

test('CI preflight resolves Python on Windows and supports an explicit interpreter', () => {
    assert.deepEqual(resolvePythonCommand({ platform: 'win32', env: {} }), {
        command: 'py',
        args: ['-3']
    });
    assert.deepEqual(resolvePythonCommand({ platform: 'linux', env: { PYTHON: '/opt/python3' } }), {
        command: '/opt/python3',
        args: []
    });

    const windowsStep = buildSteps({ platform: 'win32', env: {} })[0];
    assert.equal(windowsStep.command, 'py');
    assert.deepEqual(windowsStep.args, ['-3', 'test/ci_backend_tests_test.py']);
});

test('CI preflight adds real service integration tests only when requested', () => {
    assert.equal(buildSteps().some(step => step.args.includes('test:integration:services')), false);
    assert.equal(buildSteps({ withServices: true }).some(step => step.args.includes('test:integration:services')), true);
    assert.deepEqual(parseArguments(['--with-services']), { withServices: true });
});

test('package scripts expose preflight and cross-platform visual baseline regeneration', () => {
    assert.equal(packageJson.scripts['ci:preflight'], 'node scripts/run-ci-preflight.js');
    assert.equal(packageJson.scripts['ci:preflight:services'], 'node scripts/run-ci-preflight.js --with-services');
    assert.equal(packageJson.scripts['visual:baselines:update'], 'node scripts/update-visual-baselines.js');
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'scripts', 'update-visual-baselines.js')), true);
});
