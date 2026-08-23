const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    analyzePackageLock,
    verifyPackageLockIntegrity
} = require('../scripts/verify-package-lock-integrity');

function packageMetadata(overrides = {}) {
    return {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
        integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`,
        ...overrides
    };
}

test('committed package-lock uses only the npm registry with SHA-512 integrity metadata', () => {
    const result = verifyPackageLockIntegrity();

    assert.ok(result.checkedPackages > 250);
    assert.deepEqual(result.errors, []);
});

test('lockfile validator rejects missing integrity and non-registry package sources', () => {
    const result = analyzePackageLock({
        lockfileVersion: 3,
        packages: {
            '': {},
            'node_modules/missing-integrity': packageMetadata({ integrity: undefined }),
            'node_modules/untrusted-source': packageMetadata({
                resolved: 'https://example.invalid/package.tgz'
            })
        }
    });

    assert.equal(result.checkedPackages, 2);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /missing-integrity.*SHA512/);
    assert.match(result.errors[1], /untrusted-source.*registry\.npmjs\.org/);
});

test('lockfile validator rejects weaker integrity algorithms', () => {
    const result = analyzePackageLock({
        lockfileVersion: 3,
        packages: {
            'node_modules/weak': packageMetadata({ integrity: 'sha1-deadbeef=' })
        }
    });

    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /non-SHA512/);
});

test('lockfile validator reports malformed JSON without throwing', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-lockfile-'));
    const lockfilePath = path.join(tempDirectory, 'package-lock.json');
    fs.writeFileSync(lockfilePath, '{invalid-json', 'utf8');

    const result = verifyPackageLockIntegrity({ lockfilePath });

    assert.equal(result.checkedPackages, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Unable to read package lock/);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
});
