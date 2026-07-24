#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const GENERATED_FILES = Object.freeze([
    'public/index.html',
    'public/style.bundle.css',
    'public/game.bundle.min.js',
    'public/service-worker.js'
]);

function executable(name) {
    return process.platform === 'win32' ? `${name}.cmd` : name;
}

function runStep({ name, command, args = [], env = process.env }) {
    process.stdout.write(`\n=== ${name} ===\n`);
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
        shell: false
    });

    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    if (result.error) {
        console.error(`[preflight] ${name}: ${result.error.message}`);
    }
    console.log(exitCode === 0
        ? `[preflight] OK: ${name}`
        : `[preflight] EȘEC (${exitCode}): ${name}`);
    return { name, exitCode };
}

function buildSteps({ withServices = false } = {}) {
    const npm = executable('npm');
    const steps = [
        { name: 'Build production', command: npm, args: ['run', 'build'] },
        { name: 'Backend tests and coverage', command: npm, args: ['run', 'test:coverage'] },
        { name: 'Responsive and visual E2E', command: npm, args: ['run', 'test:e2e:responsive'] },
        { name: 'Profile and reconnection E2E', command: npm, args: ['run', 'test:e2e:flows'] },
        { name: 'Accessibility E2E', command: npm, args: ['run', 'test:e2e:accessibility'] },
        {
            name: 'Generated frontend files are committed',
            command: 'git',
            args: ['diff', '--exit-code', '--', ...GENERATED_FILES]
        }
    ];

    if (withServices) {
        steps.splice(2, 0, {
            name: 'Redis and PostgreSQL integration tests',
            command: npm,
            args: ['run', 'test:integration:services']
        });
    }
    return steps;
}

function parseArguments(argv = process.argv.slice(2)) {
    return {
        withServices: argv.includes('--with-services')
    };
}

function main() {
    const options = parseArguments();
    const results = buildSteps(options).map(runStep);
    const failures = results.filter(result => result.exitCode !== 0);

    console.log('\n=== Rezumat preflight ===');
    for (const result of results) {
        console.log(`${result.exitCode === 0 ? '✓' : '✗'} ${result.name}`);
    }

    if (failures.length > 0) {
        console.error(`\n[preflight] ${failures.length} etapă(e) au eșuat. Nu face push până nu sunt rezolvate.`);
        process.exitCode = 1;
        return;
    }

    console.log('\n[preflight] Toate verificările locale au trecut.');
}

if (require.main === module) main();

module.exports = {
    GENERATED_FILES,
    buildSteps,
    executable,
    parseArguments,
    runStep
};
