#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const BACKEND_LOG_FILE = 'test-results/ci/backend-tests.log';
const GENERATED_FILES = Object.freeze([
    'public/index.html',
    'public/style.bundle.css',
    'public/game.bundle.min.js',
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

function main() {
    const options = parseArguments();
    const platform = process.platform;
    const env = process.env;
    const steps = buildSteps({ ...options, platform, env });
    const results = runSteps(steps, {
        afterStep(step, result) {
            if (step.id !== 'backend-tests' || !String(env.GITHUB_STEP_SUMMARY || '').trim()) {
                return null;
            }
            const summaryStep = buildBackendSummaryStep({
                exitCode: result.exitCode,
                platform,
                env
            });
            return { id: summaryStep.id, ...runStep(summaryStep) };
        }
    });
    const failures = results.filter(result => result.exitCode !== 0);

    console.log('\n=== Rezumat ci:verify ===');
    for (const result of results) {
        console.log(`${result.exitCode === 0 ? '✓' : '✗'} ${result.name}`);
    }

    if (failures.length > 0) {
        console.error(`\n[ci:verify] ${failures.length} etapă(e) au eșuat. Nu face push până nu sunt rezolvate.`);
        process.exitCode = 1;
        return;
    }

    console.log('\n[ci:verify] Toate verificările au trecut.');
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
    runStep,
    runSteps
};
