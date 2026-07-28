#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_EXCLUDED_DIRECTORIES = Object.freeze([
    '.git',
    '.hg',
    '.svn',
    '.tox',
    '.venv',
    'env',
    'node_modules',
    'venv'
]);

const PYTHON_BYTECODE_PATTERN = /\.(?:pyc|pyo)$/i;

function cleanupPythonCache({
    rootDirectory = process.cwd(),
    excludedDirectories = DEFAULT_EXCLUDED_DIRECTORIES,
    fsModule = fs
} = {}) {
    const root = path.resolve(rootDirectory);
    const excluded = new Set(excludedDirectories);
    const result = {
        rootDirectory: root,
        removedDirectories: 0,
        removedFiles: 0
    };

    function visit(directory) {
        const entries = fsModule.readdirSync(directory, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;

            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '__pycache__') {
                    fsModule.rmSync(entryPath, {
                        recursive: true,
                        force: true,
                        maxRetries: 3,
                        retryDelay: 50
                    });
                    result.removedDirectories += 1;
                    continue;
                }
                if (!excluded.has(entry.name)) visit(entryPath);
                continue;
            }

            if (entry.isFile() && PYTHON_BYTECODE_PATTERN.test(entry.name)) {
                fsModule.rmSync(entryPath, { force: true, maxRetries: 3, retryDelay: 50 });
                result.removedFiles += 1;
            }
        }
    }

    if (fsModule.existsSync(root)) visit(root);
    return result;
}

function formatCleanupResult(result) {
    const directories = result.removedDirectories === 1
        ? '1 director __pycache__'
        : `${result.removedDirectories} directoare __pycache__`;
    const files = `${result.removedFiles} fișier${result.removedFiles === 1 ? '' : 'e'} .pyc/.pyo`;
    return `${directories} și ${files} șterse`;
}

function main() {
    try {
        const result = cleanupPythonCache();
        console.log(`[python-cache] ${formatCleanupResult(result)}.`);
    } catch (error) {
        console.error(`[python-cache] Curățarea a eșuat: ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    DEFAULT_EXCLUDED_DIRECTORIES,
    PYTHON_BYTECODE_PATTERN,
    cleanupPythonCache,
    formatCleanupResult
};
