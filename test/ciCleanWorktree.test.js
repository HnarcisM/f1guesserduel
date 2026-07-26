const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    buildWorktreeSteps,
    executeCommand,
    runCleanWorktree
} = require('../scripts/run-ci-clean-worktree');
const packageJson = require('../package.json');

function createExecutor({ dirty = false, failures = {} } = {}) {
    const calls = [];
    const executor = step => {
        calls.push(step);
        return {
            id: step.id,
            name: step.name,
            exitCode: failures[step.id] || 0,
            error: null,
            stdout: step.id === 'repository-root'
                ? path.resolve('/repo')
                : (step.id === 'repository-status' && dirty ? ' M package.json\n?? local.txt\n' : ''),
            stderr: ''
        };
    };
    return { calls, executor };
}

function silentLogger() {
    return { error() {}, log() {} };
}

test('clean worktree verification uses locked install and canonical CI command', () => {
    const steps = buildWorktreeSteps({ worktreePath: '/tmp/checkout', platform: 'linux', env: {} });

    assert.deepEqual(steps.map(step => [step.command, ...step.args].join(' ')), [
        'npm ci',
        'npm run ci:verify'
    ]);
    assert.equal(steps.every(step => step.cwd === '/tmp/checkout'), true);
    assert.equal(steps.every(step => step.env.CI === 'true'), true);
});

test('clean worktree verification resolves npm safely on Windows', () => {
    const steps = buildWorktreeSteps({
        worktreePath: 'C:\\Temp\\checkout',
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    });

    assert.equal(steps[0].command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(steps[0].args, ['/d', '/s', '/c', 'npm.cmd', 'ci']);
    assert.deepEqual(steps[1].args, ['/d', '/s', '/c', 'npm.cmd', 'run', 'ci:verify']);
});

test('clean worktree verification stops when local state differs from HEAD', () => {
    const fake = createExecutor({ dirty: true });
    const result = runCleanWorktree({
        executor: fake.executor,
        makeTempDirectory() {
            throw new Error('must not create a worktree for a dirty repository');
        },
        logger: silentLogger()
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.dirty, true);
    assert.deepEqual(fake.calls.map(call => call.id), ['repository-root', 'repository-status']);
});

test('clean worktree verification runs from HEAD and always cleans up after failure', () => {
    const fake = createExecutor({ failures: { 'ci-verify': 5 } });
    const removedDirectories = [];
    const result = runCleanWorktree({
        platform: 'linux',
        env: {},
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-test',
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: silentLogger()
    });

    assert.equal(result.exitCode, 5);
    assert.deepEqual(fake.calls.map(call => call.id), [
        'repository-root',
        'repository-status',
        'worktree-add',
        'npm-ci',
        'ci-verify',
        'worktree-remove',
        'worktree-prune'
    ]);
    assert.deepEqual(fake.calls[2].args, [
        'worktree',
        'add',
        '--detach',
        path.join('/tmp/f1-ci-worktree-test', 'checkout'),
        'HEAD'
    ]);
    assert.deepEqual(removedDirectories, ['/tmp/f1-ci-worktree-test']);
});

test('clean worktree verification does not run canonical verification when npm ci fails', () => {
    const fake = createExecutor({ failures: { 'npm-ci': 3 } });
    const result = runCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-install-failure',
        removeDirectoryFn() {},
        logger: silentLogger()
    });

    assert.equal(result.exitCode, 3);
    assert.equal(fake.calls.some(call => call.id === 'ci-verify'), false);
    assert.equal(fake.calls.some(call => call.id === 'worktree-remove'), true);
});

test('command execution never enables a shell implicitly', () => {
    let invocation = null;
    const result = executeCommand({
        id: 'example',
        name: 'Example',
        command: 'git',
        args: ['status'],
        cwd: '/repo',
        env: {},
        capture: true
    }, {
        spawn(command, args, options) {
            invocation = { command, args, options };
            return { status: 0, stdout: '', stderr: '', error: null };
        }
    });

    assert.equal(result.exitCode, 0);
    assert.equal(invocation.options.shell, false);
    assert.deepEqual(invocation.options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('package scripts expose clean worktree verification', () => {
    assert.equal(packageJson.scripts['ci:verify:clean'], 'node scripts/run-ci-clean-worktree.js');
});
