#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveNpmCommand } = require('./run-ci-preflight');

function executeCommand({ id, name, command, args = [], cwd, env = process.env, capture = false }, {
    spawn = spawnSync
} = {}) {
    if (!capture) process.stdout.write(`\n=== ${name} ===\n`);
    const result = spawn(command, args, {
        cwd,
        env,
        encoding: capture ? 'utf8' : undefined,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        shell: false
    });
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    return {
        id,
        name,
        exitCode,
        error: result.error || null,
        stdout: capture ? String(result.stdout || '') : '',
        stderr: capture ? String(result.stderr || '') : ''
    };
}

function buildWorktreeSteps({ worktreePath, platform = process.platform, env = process.env } = {}) {
    const npm = resolveNpmCommand({ platform, env });
    const ciEnv = { ...env, CI: 'true' };
    return [
        {
            id: 'npm-ci',
            name: 'Install locked dependencies in clean worktree',
            command: npm.command,
            args: [...npm.args, 'ci'],
            cwd: worktreePath,
            env: ciEnv
        },
        {
            id: 'ci-verify',
            name: 'Run canonical verification in clean worktree',
            command: npm.command,
            args: [...npm.args, 'run', 'ci:verify'],
            cwd: worktreePath,
            env: ciEnv
        }
    ];
}

function printCommandFailure(result, logger = console) {
    if (result.error) logger.error(`[ci:verify:clean] ${result.name}: ${result.error.message}`);
    if (result.stderr.trim()) logger.error(result.stderr.trim());
}

function removeDirectory(directory, fsApi = fs) {
    fsApi.rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 150
    });
}

function runCleanWorktree({
    cwd = process.cwd(),
    platform = process.platform,
    env = process.env,
    executor = executeCommand,
    makeTempDirectory = prefix => fs.mkdtempSync(prefix),
    removeDirectoryFn = removeDirectory,
    logger = console
} = {}) {
    const results = [];
    const run = step => {
        const result = executor(step);
        results.push(result);
        return result;
    };

    const rootResult = run({
        id: 'repository-root',
        name: 'Resolve repository root',
        command: 'git',
        args: ['rev-parse', '--show-toplevel'],
        cwd,
        env,
        capture: true
    });
    if (rootResult.exitCode !== 0 || !rootResult.stdout.trim()) {
        printCommandFailure(rootResult, logger);
        logger.error('[ci:verify:clean] Directorul curent nu este într-un repository Git valid.');
        return { exitCode: rootResult.exitCode || 1, results };
    }

    const repositoryRoot = path.resolve(rootResult.stdout.trim());
    const statusResult = run({
        id: 'repository-status',
        name: 'Verify committed repository state',
        command: 'git',
        args: ['status', '--porcelain=v1', '--untracked-files=all'],
        cwd: repositoryRoot,
        env,
        capture: true
    });
    if (statusResult.exitCode !== 0) {
        printCommandFailure(statusResult, logger);
        return { exitCode: statusResult.exitCode, results, repositoryRoot };
    }
    if (statusResult.stdout.trim()) {
        logger.error('[ci:verify:clean] Repository-ul conține modificări care nu fac parte din HEAD:');
        logger.error(statusResult.stdout.trim());
        logger.error('[ci:verify:clean] Fă commit sau stash înainte de verificarea checkout-ului curat.');
        return { exitCode: 1, results, repositoryRoot, dirty: true };
    }

    const temporaryRoot = makeTempDirectory(path.join(os.tmpdir(), 'f1-ci-worktree-'));
    const worktreePath = path.join(temporaryRoot, 'checkout');
    let worktreeAttempted = false;
    let worktreeAdded = false;
    let exitCode = 0;

    try {
        worktreeAttempted = true;
        const addResult = run({
            id: 'worktree-add',
            name: 'Create detached worktree from HEAD',
            command: 'git',
            args: ['worktree', 'add', '--detach', worktreePath, 'HEAD'],
            cwd: repositoryRoot,
            env
        });
        if (addResult.exitCode !== 0) {
            exitCode = addResult.exitCode;
        } else {
            worktreeAdded = true;
            for (const step of buildWorktreeSteps({ worktreePath, platform, env })) {
                const result = run(step);
                if (result.exitCode !== 0) {
                    exitCode = result.exitCode;
                    break;
                }
            }
        }
    } finally {
        if (worktreeAdded) {
            const removeResult = run({
                id: 'worktree-remove',
                name: 'Remove temporary worktree',
                command: 'git',
                args: ['worktree', 'remove', '--force', worktreePath],
                cwd: repositoryRoot,
                env
            });
            if (removeResult.exitCode !== 0) {
                try {
                    removeDirectoryFn(worktreePath);
                } catch (error) {
                    logger.error(`[ci:verify:clean] Nu am putut șterge worktree-ul: ${error.message}`);
                    if (exitCode === 0) exitCode = 1;
                }
            }
        }
        if (worktreeAttempted) {
            const pruneResult = run({
                id: 'worktree-prune',
                name: 'Prune temporary worktree metadata',
                command: 'git',
                args: ['worktree', 'prune'],
                cwd: repositoryRoot,
                env
            });
            if (pruneResult.exitCode !== 0 && exitCode === 0) exitCode = pruneResult.exitCode;
        }
        try {
            removeDirectoryFn(temporaryRoot);
        } catch (error) {
            logger.error(`[ci:verify:clean] Nu am putut șterge directorul temporar: ${error.message}`);
            if (exitCode === 0) exitCode = 1;
        }
    }

    return { exitCode, results, repositoryRoot, worktreePath };
}

function main() {
    try {
        const result = runCleanWorktree();
        if (result.exitCode !== 0) {
            console.error(`\n[ci:verify:clean] Verificarea checkout-ului curat a eșuat (${result.exitCode}).`);
            process.exitCode = result.exitCode;
            return;
        }
        console.log('\n[ci:verify:clean] Commitul HEAD trece verificarea într-un checkout curat.');
    } catch (error) {
        console.error(`[ci:verify:clean] Eroare neașteptată: ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    buildWorktreeSteps,
    executeCommand,
    removeDirectory,
    runCleanWorktree
};
