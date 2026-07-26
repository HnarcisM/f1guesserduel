const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
    buildWorktreeSteps,
    executeCommand,
    removeDirectory,
    resolvePathApi,
    runCleanWorktree
} = require('../scripts/run-ci-clean-worktree');
const packageJson = require('../package.json');

function createExecutor({
    repositoryRoot = '/repo',
    dirty = false,
    failures = {},
    stderrByStep = {}
} = {}) {
    const calls = [];
    const executor = step => {
        calls.push(step);
        return {
            id: step.id,
            name: step.name,
            exitCode: Object.hasOwn(failures, step.id) ? failures[step.id] : 0,
            error: null,
            stdout: step.id === 'repository-root'
                ? `${repositoryRoot}\n`
                : (step.id === 'repository-status' && dirty ? ' M package.json\n?? local.txt\n' : ''),
            stderr: stderrByStep[step.id] || ''
        };
    };
    return { calls, executor };
}

function createLogger() {
    const errors = [];
    return {
        errors,
        error(message) {
            errors.push(String(message));
        },
        log() {}
    };
}

function runPosixCleanWorktree(options = {}) {
    return runCleanWorktree({
        platform: 'linux',
        env: {},
        ...options
    });
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return String(result.stdout || '');
}

function executeRealGitOrSimulatedNpm(step, verifyExitCode = 0) {
    if (step.command !== 'git') {
        return {
            id: step.id,
            name: step.name,
            exitCode: step.id === 'ci-verify' ? verifyExitCode : 0,
            error: null,
            stdout: '',
            stderr: ''
        };
    }

    const result = spawnSync(step.command, step.args, {
        cwd: step.cwd,
        env: step.env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
    });
    return {
        id: step.id,
        name: step.name,
        exitCode: Number.isInteger(result.status) ? result.status : 1,
        error: result.error || null,
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || '')
    };
}

test('path handling selects explicit Windows and POSIX implementations', () => {
    assert.equal(resolvePathApi('linux'), path.posix);
    assert.equal(resolvePathApi('darwin'), path.posix);
    assert.equal(resolvePathApi('win32'), path.win32);
});

test('clean worktree verification uses locked install and canonical CI command on Linux', () => {
    const steps = buildWorktreeSteps({
        worktreePath: '/tmp/checkout',
        platform: 'linux',
        env: { CUSTOM_VALUE: 'kept' }
    });

    assert.deepEqual(steps.map(step => [step.command, ...step.args].join(' ')), [
        'npm ci',
        'npm run ci:verify'
    ]);
    assert.equal(steps.every(step => step.cwd === '/tmp/checkout'), true);
    assert.equal(steps.every(step => step.env.CI === 'true'), true);
    assert.equal(steps.every(step => step.env.CUSTOM_VALUE === 'kept'), true);
});

test('clean worktree verification resolves npm and paths safely on Windows', () => {
    const steps = buildWorktreeSteps({
        worktreePath: 'C:\\Temp\\checkout',
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    });

    assert.equal(steps[0].command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(steps[0].args, ['/d', '/s', '/c', 'npm.cmd', 'ci']);
    assert.deepEqual(steps[1].args, ['/d', '/s', '/c', 'npm.cmd', 'run', 'ci:verify']);
});

test('clean worktree verification stops when repository root cannot be resolved', () => {
    const fake = createExecutor({ failures: { 'repository-root': 128 }, stderrByStep: { 'repository-root': 'not a repository' } });
    const logger = createLogger();
    let tempAttempted = false;

    const result = runCleanWorktree({
        executor: fake.executor,
        makeTempDirectory() {
            tempAttempted = true;
        },
        logger
    });

    assert.equal(result.exitCode, 128);
    assert.equal(tempAttempted, false);
    assert.deepEqual(fake.calls.map(call => call.id), ['repository-root']);
    assert.ok(logger.errors.some(message => message.includes('not a repository')));
});

test('clean worktree verification propagates repository status failures without creating temp data', () => {
    const fake = createExecutor({ failures: { 'repository-status': 6 } });
    let tempAttempted = false;
    const result = runCleanWorktree({
        executor: fake.executor,
        makeTempDirectory() {
            tempAttempted = true;
        },
        logger: createLogger()
    });

    assert.equal(result.exitCode, 6);
    assert.equal(tempAttempted, false);
    assert.deepEqual(fake.calls.map(call => call.id), ['repository-root', 'repository-status']);
});

test('clean worktree verification stops when local state differs from HEAD', () => {
    const fake = createExecutor({ dirty: true });
    const result = runCleanWorktree({
        executor: fake.executor,
        makeTempDirectory() {
            throw new Error('must not create a worktree for a dirty repository');
        },
        logger: createLogger()
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.dirty, true);
    assert.deepEqual(fake.calls.map(call => call.id), ['repository-root', 'repository-status']);
});

test('temporary directory creation failures return a controlled result', () => {
    const fake = createExecutor();
    const logger = createLogger();
    let receivedPrefix = null;
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        temporaryDirectoryRoot: '/isolated/tmp',
        makeTempDirectory(prefix) {
            receivedPrefix = prefix;
            throw new Error('disk unavailable');
        },
        logger
    });

    assert.equal(receivedPrefix, '/isolated/tmp/f1-ci-worktree-');
    assert.equal(result.exitCode, 1);
    assert.equal(result.error.message, 'disk unavailable');
    assert.equal(fake.calls.some(call => call.id === 'worktree-add'), false);
    assert.ok(logger.errors.some(message => message.includes('disk unavailable')));
});

test('POSIX temporary directories use an isolated checkout child and clean up after success', () => {
    const fake = createExecutor();
    const removedDirectories = [];
    let receivedPrefix = null;
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        temporaryDirectoryRoot: '/var/tmp/tests',
        makeTempDirectory(prefix) {
            receivedPrefix = prefix;
            return '/var/tmp/tests/f1-ci-worktree-abc123';
        },
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: createLogger()
    });

    assert.equal(result.exitCode, 0);
    assert.equal(receivedPrefix, '/var/tmp/tests/f1-ci-worktree-');
    assert.equal(result.worktreePath, '/var/tmp/tests/f1-ci-worktree-abc123/checkout');
    assert.deepEqual(fake.calls.find(call => call.id === 'worktree-add').args, [
        'worktree',
        'add',
        '--detach',
        '/var/tmp/tests/f1-ci-worktree-abc123/checkout',
        'HEAD'
    ]);
    assert.deepEqual(removedDirectories, ['/var/tmp/tests/f1-ci-worktree-abc123']);
});

test('Windows temporary directories retain native separators independent of the host platform', () => {
    const fake = createExecutor({ repositoryRoot: 'C:/Projects/F1Guesser' });
    const removedDirectories = [];
    let receivedPrefix = null;
    const result = runCleanWorktree({
        platform: 'win32',
        env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
        executor: fake.executor,
        temporaryDirectoryRoot: 'C:\\Temp',
        makeTempDirectory(prefix) {
            receivedPrefix = prefix;
            return 'C:\\Temp\\f1-ci-worktree-abc123';
        },
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: createLogger()
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.repositoryRoot, 'C:\\Projects\\F1Guesser');
    assert.equal(receivedPrefix, 'C:\\Temp\\f1-ci-worktree-');
    assert.equal(result.worktreePath, 'C:\\Temp\\f1-ci-worktree-abc123\\checkout');
    assert.equal(fake.calls.find(call => call.id === 'npm-ci').cwd, result.worktreePath);
    assert.deepEqual(removedDirectories, ['C:\\Temp\\f1-ci-worktree-abc123']);
});

test('canonical verification failure is propagated and cleanup always runs', () => {
    const fake = createExecutor({ failures: { 'ci-verify': 5 } });
    const removedDirectories = [];
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-test',
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: createLogger()
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
    assert.deepEqual(removedDirectories, ['/tmp/f1-ci-worktree-test']);
});

test('npm ci failure is propagated and canonical verification is skipped', () => {
    const fake = createExecutor({ failures: { 'npm-ci': 3 } });
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-install-failure',
        removeDirectoryFn() {},
        logger: createLogger()
    });

    assert.equal(result.exitCode, 3);
    assert.equal(fake.calls.some(call => call.id === 'ci-verify'), false);
    assert.equal(fake.calls.some(call => call.id === 'worktree-remove'), true);
    assert.equal(fake.calls.some(call => call.id === 'worktree-prune'), true);
});

test('worktree add failure is propagated while temp directory and metadata are cleaned', () => {
    const fake = createExecutor({ failures: { 'worktree-add': 4 } });
    const removedDirectories = [];
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-add-failure',
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: createLogger()
    });

    assert.equal(result.exitCode, 4);
    assert.equal(fake.calls.some(call => call.id === 'npm-ci'), false);
    assert.equal(fake.calls.some(call => call.id === 'worktree-remove'), false);
    assert.equal(fake.calls.some(call => call.id === 'worktree-prune'), true);
    assert.deepEqual(removedDirectories, ['/tmp/f1-ci-worktree-add-failure']);
});

test('failed git worktree removal falls back to direct directory cleanup', () => {
    const fake = createExecutor({ failures: { 'worktree-remove': 9 } });
    const removedDirectories = [];
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-remove-failure',
        removeDirectoryFn: directory => removedDirectories.push(directory),
        logger: createLogger()
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(removedDirectories, [
        '/tmp/f1-ci-worktree-remove-failure/checkout',
        '/tmp/f1-ci-worktree-remove-failure'
    ]);
    assert.equal(fake.calls.some(call => call.id === 'worktree-prune'), true);
});

test('failed fallback worktree cleanup changes a successful verification into failure', () => {
    const fake = createExecutor({ failures: { 'worktree-remove': 9 } });
    const logger = createLogger();
    const result = runPosixCleanWorktree({
        executor: fake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-fallback-failure',
        removeDirectoryFn(directory) {
            if (directory.endsWith('/checkout')) throw new Error('checkout locked');
        },
        logger
    });

    assert.equal(result.exitCode, 1);
    assert.ok(logger.errors.some(message => message.includes('checkout locked')));
});

test('worktree prune failure is propagated only when no earlier step failed', () => {
    const successful = createExecutor({ failures: { 'worktree-prune': 8 } });
    const successfulResult = runPosixCleanWorktree({
        executor: successful.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-prune-failure',
        removeDirectoryFn() {},
        logger: createLogger()
    });
    assert.equal(successfulResult.exitCode, 8);

    const primaryFailure = createExecutor({ failures: { 'ci-verify': 7, 'worktree-prune': 8 } });
    const failedResult = runPosixCleanWorktree({
        executor: primaryFailure.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-primary-failure',
        removeDirectoryFn() {},
        logger: createLogger()
    });
    assert.equal(failedResult.exitCode, 7);
});

test('temporary root cleanup failure is reported without overwriting a primary verification failure', () => {
    const successFake = createExecutor();
    const successResult = runPosixCleanWorktree({
        executor: successFake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-temp-cleanup',
        removeDirectoryFn() {
            throw new Error('temporary root locked');
        },
        logger: createLogger()
    });
    assert.equal(successResult.exitCode, 1);

    const failedFake = createExecutor({ failures: { 'ci-verify': 11 } });
    const failedResult = runPosixCleanWorktree({
        executor: failedFake.executor,
        makeTempDirectory: () => '/tmp/f1-ci-worktree-temp-cleanup-primary',
        removeDirectoryFn() {
            throw new Error('temporary root locked');
        },
        logger: createLogger()
    });
    assert.equal(failedResult.exitCode, 11);
});

test('directory cleanup is recursive, forced and retries transient Windows locks', () => {
    let invocation = null;
    removeDirectory('C:\\Temp\\checkout', {
        rmSync(directory, options) {
            invocation = { directory, options };
        }
    });

    assert.equal(invocation.directory, 'C:\\Temp\\checkout');
    assert.deepEqual(invocation.options, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 150
    });
});

test('command execution never enables a shell implicitly and preserves capture mode', () => {
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
            return { status: 0, stdout: 'clean', stderr: '', error: null };
        }
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'clean');
    assert.equal(invocation.options.shell, false);
    assert.deepEqual(invocation.options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('command launch errors become exit code 1 instead of throwing', () => {
    const launchError = new Error('command missing');
    const result = executeCommand({
        id: 'missing',
        name: 'Missing command',
        command: 'missing-command',
        capture: true
    }, {
        spawn() {
            return { status: null, stdout: '', stderr: '', error: launchError };
        }
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.error, launchError);
});

test('real detached Git worktree is removed after propagated verification failure', {
    timeout: 20_000
}, t => {
    const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8', shell: false });
    if (gitVersion.status !== 0) {
        t.skip('Git is not available in this environment.');
        return;
    }

    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-ci-real-worktree-test-'));
    const repositoryRoot = path.join(testRoot, 'repository');
    const tempParent = path.join(testRoot, 'temporary');
    fs.mkdirSync(repositoryRoot, { recursive: true });
    fs.mkdirSync(tempParent, { recursive: true });

    try {
        runGit(repositoryRoot, ['init']);
        runGit(repositoryRoot, ['config', 'user.name', 'CI Test']);
        runGit(repositoryRoot, ['config', 'user.email', 'ci-test@example.invalid']);
        fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
        runGit(repositoryRoot, ['add', 'package.json']);
        runGit(repositoryRoot, ['commit', '-m', 'fixture']);

        let temporaryRoot = null;
        const result = runCleanWorktree({
            cwd: repositoryRoot,
            platform: process.platform,
            env: process.env,
            executor: step => executeRealGitOrSimulatedNpm(step, 12),
            temporaryDirectoryRoot: tempParent,
            makeTempDirectory(prefix) {
                temporaryRoot = fs.mkdtempSync(prefix);
                return temporaryRoot;
            },
            logger: createLogger()
        });

        assert.equal(result.exitCode, 12);
        assert.equal(fs.existsSync(temporaryRoot), false);
        const worktrees = runGit(repositoryRoot, ['worktree', 'list', '--porcelain']);
        assert.equal((worktrees.match(/^worktree /gm) || []).length, 1);
        assert.equal(worktrees.includes('/checkout'), false);
    } finally {
        fs.rmSync(testRoot, { recursive: true, force: true });
    }
});

test('package scripts expose clean worktree verification', () => {
    assert.equal(packageJson.scripts['ci:verify:clean'], 'node scripts/run-ci-clean-worktree.js');
});
