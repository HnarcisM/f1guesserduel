#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { cleanupPythonCache, formatCleanupResult } = require('./cleanup-python-cache');

const BACKEND_LOG_FILE = 'test-results/ci/backend-tests.log';
const GENERATED_FILES = Object.freeze([
    'public/index.html',
    'public/style.bundle.css',
    'public/game.bundle.min.js',
    'public/game-hub.bundle.js',
    'public/service-worker.js'
]);

function resolveNpmCommand({ platform = process.platform, env = process.env } = {}) {
    if (platform !== 'win32') return { command: 'npm', args: [] };

    const command = String(env.ComSpec || env.COMSPEC || 'cmd.exe').trim() || 'cmd.exe';
    return {
        command,
        args: ['/d', '/s', '/c', 'npm.cmd']
    };
}

function resolvePythonCommand({ platform = process.platform, env = process.env } = {}) {
    const configuredPython = String(env.PYTHON || '').trim();
    if (configuredPython) return { command: configuredPython, args: [] };
    if (platform === 'win32') return { command: 'py', args: ['-3'] };
    return { command: 'python', args: [] };
}

function runStep({ name, command, args = [], env = process.env }, { spawn = spawnSync } = {}) {
    process.stdout.write(`\n=== ${name} ===\n`);
    const result = spawn(command, args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
        shell: false
    });

    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    if (result.error) {
        console.error(`[ci:verify] ${name}: ${result.error.message}`);
    }
    console.log(exitCode === 0
        ? `[ci:verify] OK: ${name}`
        : `[ci:verify] EȘEC (${exitCode}): ${name}`);
    return { name, exitCode };
}

function buildBackendSummaryStep({ exitCode, platform = process.platform, env = process.env } = {}) {
    const python = resolvePythonCommand({ platform, env });
    return {
        id: 'backend-summary',
        name: 'Publish backend test summary',
        command: python.command,
        args: [
            ...python.args,
            'scripts/ci_backend_tests.py',
            'summary',
            '--log-file',
            BACKEND_LOG_FILE,
            '--exit-code',
            String(exitCode)
        ],
        env
    };
}

function buildSteps({
    withServices = false,
    withBrowser = false,
    platform = process.platform,
    env = process.env
} = {}) {
    const npm = resolveNpmCommand({ platform, env });
    const python = resolvePythonCommand({ platform, env });
    const steps = [
        {
            id: 'lockfile-integrity',
            name: 'Verify package-lock integrity',
            command: 'node',
            args: ['scripts/verify-package-lock-integrity.js']
        },
        {
            id: 'python-helpers',
            name: 'Validate CI Python helpers',
            command: python.command,
            args: [...python.args, 'test/ci_backend_tests_test.py']
        },
        {
            id: 'build',
            name: 'Build production',
            command: npm.command,
            args: [...npm.args, 'run', 'build']
        },
        {
            id: 'backend-tests',
            name: 'Backend tests and coverage',
            command: python.command,
            args: [
                ...python.args,
                'scripts/ci_backend_tests.py',
                'run',
                '--propagate-exit-code',
                '--log-file',
                BACKEND_LOG_FILE,
                '--',
                npm.command,
                ...npm.args,
                'run',
                'test:coverage'
            ]
        },
        {
            id: 'generated-files',
            name: 'Generated frontend files are committed',
            command: 'git',
            args: ['diff', '--exit-code', '--', ...GENERATED_FILES]
        },
        {
            id: 'whitespace',
            name: 'Whitespace validation',
            command: 'git',
            args: ['diff', '--check']
        }
    ];

    if (withServices) {
        steps.push({
            id: 'integration-services',
            name: 'Redis and PostgreSQL integration tests',
            command: npm.command,
            args: [...npm.args, 'run', 'test:integration:services']
        });
    }

    if (withBrowser) {
        steps.push(
            {
                id: 'responsive-visual',
                name: 'Responsive and visual E2E',
                command: npm.command,
                args: [...npm.args, 'run', 'test:e2e:responsive'],
                continueOnFailure: true
            },
            {
                id: 'profile-reconnection',
                name: 'Profile and reconnection E2E',
                command: npm.command,
                args: [...npm.args, 'run', 'test:e2e:flows'],
                continueOnFailure: true
            },
            {
                id: 'admin-console',
                name: 'Admin console E2E',
                command: npm.command,
                args: [...npm.args, 'run', 'test:e2e:admin'],
                continueOnFailure: true
            },
            {
                id: 'accessibility',
                name: 'Accessibility E2E',
                command: npm.command,
                args: [...npm.args, 'run', 'test:e2e:accessibility'],
                continueOnFailure: true
            }
        );
    }

    return steps;
}

function parseArguments(argv = process.argv.slice(2)) {
    return {
        withServices: argv.includes('--with-services'),
        withBrowser: argv.includes('--with-browser')
    };
}

function runSteps(steps, {
    runner = runStep,
    afterStep = null
} = {}) {
    const results = [];

    for (const step of steps) {
        const result = { id: step.id, ...runner(step) };
        results.push(result);

        const additionalResults = afterStep
            ? afterStep(step, result)
            : null;
        const normalizedAdditionalResults = additionalResults
            ? (Array.isArray(additionalResults) ? additionalResults : [additionalResults])
            : [];
        results.push(...normalizedAdditionalResults);

        const additionalFailure = normalizedAdditionalResults.some(item => item.exitCode !== 0);
        if (additionalFailure || (result.exitCode !== 0 && !step.continueOnFailure)) {
            break;
        }
    }

    return results;
}

function runCiVerification({
    argv = process.argv.slice(2),
    platform = process.platform,
    env = process.env,
    runner = runStep,
    cleanup = cleanupPythonCache,
    consoleObject = console,
    rootDirectory = process.cwd()
} = {}) {
    let results = [];
    let exitCode = 1;
    let cleanupResult = null;
    let cleanupError = null;

    try {
        const options = parseArguments(argv);
        const steps = buildSteps({ ...options, platform, env });
        results = runSteps(steps, {
            runner,
            afterStep(step, result) {
                if (step.id !== 'backend-tests' || !String(env.GITHUB_STEP_SUMMARY || '').trim()) {
                    return null;
                }
                const summaryStep = buildBackendSummaryStep({
                    exitCode: result.exitCode,
                    platform,
                    env
                });
                return { id: summaryStep.id, ...runner(summaryStep) };
            }
        });
        const failures = results.filter(result => result.exitCode !== 0);

        consoleObject.log('\n=== Rezumat ci:verify ===');
        for (const result of results) {
            consoleObject.log(`${result.exitCode === 0 ? '✓' : '✗'} ${result.name}`);
        }

        exitCode = failures.length > 0 ? 1 : 0;
        if (exitCode !== 0) {
            consoleObject.error(`\n[ci:verify] ${failures.length} etapă(e) au eșuat. Nu face push până nu sunt rezolvate.`);
        } else {
            consoleObject.log('\n[ci:verify] Toate verificările au trecut.');
        }
    } finally {
        try {
            cleanupResult = cleanup({ rootDirectory });
            consoleObject.log(`[ci:verify] Cache Python: ${formatCleanupResult(cleanupResult)}.`);
        } catch (error) {
            cleanupError = error;
            consoleObject.warn(`[ci:verify] Cache-ul Python nu a putut fi șters: ${error.message}`);
        }
    }

    return { results, exitCode, cleanupResult, cleanupError };
}

function main() {
    const result = runCiVerification();
    process.exitCode = result.exitCode;
}

if (require.main === module) main();

module.exports = {
    BACKEND_LOG_FILE,
    GENERATED_FILES,
    buildBackendSummaryStep,
    buildSteps,
    resolveNpmCommand,
    parseArguments,
    resolvePythonCommand,
    runCiVerification,
    runStep,
    runSteps
};
