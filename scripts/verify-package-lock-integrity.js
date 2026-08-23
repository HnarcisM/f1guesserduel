#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOCKFILE_PATH = path.join(__dirname, '..', 'package-lock.json');
const NPM_REGISTRY_PREFIX = 'https://registry.npmjs.org/';
const SHA512_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

function isInstalledPackageEntry(packagePath, metadata) {
    return packagePath.startsWith('node_modules/')
        && metadata
        && typeof metadata === 'object'
        && metadata.link !== true;
}

function analyzePackageLock(lockfile) {
    const errors = [];
    let checkedPackages = 0;

    if (!lockfile || typeof lockfile !== 'object' || Array.isArray(lockfile)) {
        return { checkedPackages, errors: ['package-lock.json must contain a JSON object.'] };
    }

    if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 3) {
        errors.push('package-lock.json must use lockfileVersion 3 or newer.');
    }

    if (!lockfile.packages || typeof lockfile.packages !== 'object' || Array.isArray(lockfile.packages)) {
        errors.push('package-lock.json must contain a packages object.');
        return { checkedPackages, errors };
    }

    for (const [packagePath, metadata] of Object.entries(lockfile.packages)) {
        if (!isInstalledPackageEntry(packagePath, metadata)) continue;
        if (!metadata.resolved) continue;

        checkedPackages += 1;
        const resolved = String(metadata.resolved);
        const integrity = typeof metadata.integrity === 'string' ? metadata.integrity.trim() : '';

        if (!resolved.startsWith(NPM_REGISTRY_PREFIX)) {
            errors.push(`${packagePath}: resolved URL must use ${NPM_REGISTRY_PREFIX}`);
        }
        if (!SHA512_INTEGRITY_PATTERN.test(integrity)) {
            errors.push(`${packagePath}: missing or non-SHA512 integrity metadata.`);
        }
    }

    return { checkedPackages, errors };
}

function verifyPackageLockIntegrity({ lockfilePath = DEFAULT_LOCKFILE_PATH } = {}) {
    let lockfile;
    try {
        lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    } catch (error) {
        return {
            checkedPackages: 0,
            errors: [`Unable to read package lock: ${error.message}`]
        };
    }
    return analyzePackageLock(lockfile);
}

function main() {
    const result = verifyPackageLockIntegrity();
    if (result.errors.length > 0) {
        console.error(`[lockfile] ${result.errors.length} supply-chain validation error(s):`);
        for (const error of result.errors) console.error(`- ${error}`);
        process.exitCode = 1;
        return;
    }

    console.log(`[lockfile] OK: ${result.checkedPackages} registry package(s) use HTTPS and SHA-512 integrity metadata.`);
}

if (require.main === module) main();

module.exports = {
    DEFAULT_LOCKFILE_PATH,
    NPM_REGISTRY_PREFIX,
    SHA512_INTEGRITY_PATTERN,
    analyzePackageLock,
    verifyPackageLockIntegrity
};
