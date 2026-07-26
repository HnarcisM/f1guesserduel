const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    BACKEND_LOG_FILE,
    GENERATED_FILES,
    buildBackendSummaryStep,
    buildSteps,
    parseArguments,
    resolveNpmCommand,
    resolvePythonCommand,
    runStep,
    runSteps
} = require('../scripts/run-ci-preflight');

const packageJson = require('../package.json');

function commandOf(step) {
    return [step.command, ...step.args].join(' ');
}

test('ci:verify builds generated assets before testing them in one fail-fast sequence', () => {
    const steps = buildSteps({ platform: 'linux', env: {} });
    const commands = steps.map(commandOf);

    assert.deepEqual(steps.map(step => step.id), [
        'python-helpers',
        'build',
        'backend-tests',
        'generated-files',
        'whitespace'
    ]);
    assert.equal(commands[0], 'python test/ci_backend_tests_test.py');
    assert.equal(commands[1], 'npm run build');
    assert.equal(
        commands[2],
        `python scripts/ci_backend_tests.py run --propagate-exit-code --log-file ${BACKEND_LOG_FILE} -- npm run test:coverage`
    );
    assert.deepEqual(steps[3].args, ['diff', '--exit-code', '--', ...GENERATED_FILES]);
    assert.equal(commands[4], 'git diff --check');
    assert.equal(steps.some(step => step.args.includes('test:integration:services')), false);
    assert.equal(steps.some(step => step.id === 'responsive-visual'), false);
});

test('ci:verify resolves Python and npm commands cross-platform', () => {
    assert.deepEqual(resolvePythonCommand({ platform: 'win32', env: {} }), {
        command: 'py',
        args: ['-3']
    });
    assert.deepEqual(resolvePythonCommand({ platform: 'linux', env: { PYTHON: '/opt/python3' } }), {
        command: '/opt/python3',
        args: []
    });
    assert.deepEqual(resolveNpmCommand({ platform: 'linux', env: {} }), {
        command: 'npm',
        args: []
    });
    assert.deepEqual(resolveNpmCommand({
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    }), {
        command: 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', 'npm.cmd']
    });

    const windowsSteps = buildSteps({
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    });
    assert.equal(windowsSteps[0].command, 'py');
    assert.deepEqual(windowsSteps[0].args, ['-3', 'test/ci_backend_tests_test.py']);
    assert.equal(windowsSteps[1].command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(windowsSteps[1].args, ['/d', '/s', '/c', 'npm.cmd', 'run', 'build']);
    assert.deepEqual(windowsSteps[2].args.slice(-8), [
        '--',
        'C:\\Windows\\System32\\cmd.exe',
        '/d',
        '/s',
        '/c',
        'npm.cmd',
        'run',
        'test:coverage'
    ]);
});

test('Windows npm steps execute cmd.exe directly without enabling a Node shell', () => {
    const step = buildSteps({
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    }).find(candidate => candidate.id === 'build');
    let invocation = null;

    const result = runStep(step, {
        spawn(command, args, options) {
            invocation = { command, args, options };
            return { status: 0, error: null };
        }
    });

    assert.equal(result.exitCode, 0);
    assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(invocation.args, ['/d', '/s', '/c', 'npm.cmd', 'run', 'build']);
    assert.equal(invocation.options.shell, false);
});

test('ci:verify:full adds service integration and every browser quality suite', () => {
    const steps = buildSteps({ withServices: true, withBrowser: true, platform: 'linux', env: {} });
    const commands = steps.map(commandOf);

    assert.ok(commands.includes('npm run test:integration:services'));
    assert.ok(commands.includes('npm run test:e2e:responsive'));
    assert.ok(commands.includes('npm run test:e2e:flows'));
    assert.ok(commands.includes('npm run test:e2e:admin'));
    assert.ok(commands.includes('npm run test:e2e:accessibility'));
    assert.equal(
        steps.filter(step => step.continueOnFailure).map(step => step.id).join(','),
        'responsive-visual,profile-reconnection,admin-console,accessibility'
    );
    assert.deepEqual(parseArguments(['--with-services', '--with-browser']), {
        withServices: true,
        withBrowser: true
    });
});

test('canonical verification stops after a required failure but collects optional browser failures', () => {
    const requiredSteps = [
        { id: 'first', name: 'First' },
        { id: 'second', name: 'Second' },
        { id: 'third', name: 'Third' }
    ];
    const requiredSeen = [];
    const requiredResults = runSteps(requiredSteps, {
        runner(step) {
            requiredSeen.push(step.id);
            return { name: step.name, exitCode: step.id === 'second' ? 2 : 0 };
        }
    });

    assert.deepEqual(requiredSeen, ['first', 'second']);
    assert.equal(requiredResults.at(-1).exitCode, 2);

    const browserSteps = [
        { id: 'responsive', name: 'Responsive', continueOnFailure: true },
        { id: 'flows', name: 'Flows', continueOnFailure: true },
        { id: 'accessibility', name: 'Accessibility', continueOnFailure: true }
    ];
    const browserSeen = [];
    const browserResults = runSteps(browserSteps, {
        runner(step) {
            browserSeen.push(step.id);
            return { name: step.name, exitCode: step.id === 'flows' ? 1 : 0 };
        }
    });

    assert.deepEqual(browserSeen, ['responsive', 'flows', 'accessibility']);
    assert.equal(browserResults.filter(result => result.exitCode !== 0).length, 1);
});

test('GitHub backend summary uses the exact captured test result', () => {
    const step = buildBackendSummaryStep({
        exitCode: 7,
        platform: 'linux',
        env: { GITHUB_STEP_SUMMARY: '/tmp/summary.md' }
    });

    assert.equal(step.command, 'python');
    assert.deepEqual(step.args, [
        'scripts/ci_backend_tests.py',
        'summary',
        '--log-file',
        BACKEND_LOG_FILE,
        '--exit-code',
        '7'
    ]);
});

test('package scripts expose canonical and full CI verification commands', () => {
    assert.equal(packageJson.scripts['ci:verify'], 'node scripts/run-ci-preflight.js');
    assert.equal(
        packageJson.scripts['ci:verify:full'],
        'node scripts/run-ci-preflight.js --with-services --with-browser'
    );
    assert.equal(packageJson.scripts['ci:preflight'], 'npm run ci:verify:full');
    assert.equal(packageJson.scripts['ci:preflight:services'], 'npm run ci:verify:full');
    assert.equal(packageJson.scripts['visual:baselines:update'], 'node scripts/update-visual-baselines.js');
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'scripts', 'update-visual-baselines.js')), true);
});
