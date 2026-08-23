const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
    DUMMY_PASSWORD_HASH,
    PBKDF2_ITERATIONS,
    hashPassword,
    needsPasswordRehash,
    verifyPassword
} = require('../server/auth/passwordService');

test('hashPassword returns a promise and stores pbkdf2 metadata', async () => {
    const hashPromise = hashPassword('CorrectHorseBatteryStaple1!');

    assert.equal(typeof hashPromise.then, 'function');

    const storedHash = await hashPromise;
    const [algorithm, iterationsText, salt, hash] = storedHash.split('$');

    assert.equal(algorithm, 'pbkdf2');
    assert.equal(Number(iterationsText), PBKDF2_ITERATIONS);
    assert.match(salt, /^[a-f0-9]{32}$/);
    assert.match(hash, /^[a-f0-9]{128}$/);
});

test('verifyPassword accepts only the matching password', async () => {
    const storedHash = await hashPassword('CorrectHorseBatteryStaple1!');

    assert.equal(await verifyPassword('CorrectHorseBatteryStaple1!', storedHash), true);
    assert.equal(await verifyPassword('wrong-password', storedHash), false);
});

test('legacy PBKDF2 hashes remain valid and are marked for transparent upgrade', async () => {
    const password = 'LegacyPassword123!';
    const iterations = 120000;
    const salt = '00112233445566778899aabbccddeeff';
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const legacyHash = `pbkdf2$${iterations}$${salt}$${hash}`;

    assert.equal(await verifyPassword(password, legacyHash), true);
    assert.equal(needsPasswordRehash(legacyHash), true);

    const currentHash = await hashPassword(password);
    assert.equal(needsPasswordRehash(currentHash), false);

    const strongerHash = currentHash.replace(
        `$${PBKDF2_ITERATIONS}$`,
        `$${PBKDF2_ITERATIONS + 10000}$`
    );
    assert.equal(needsPasswordRehash(strongerHash), false);
});

test('verifyPassword rejects malformed hashes safely', async () => {
    assert.equal(await verifyPassword('password', null), false);
    assert.equal(await verifyPassword('password', 'not-a-valid-hash'), false);
    assert.equal(await verifyPassword('password', 'pbkdf2$0$salt$hash'), false);
    assert.equal(await verifyPassword('password', 'pbkdf2$abc$salt$hash'), false);
    assert.equal(await verifyPassword('password', `pbkdf2$${PBKDF2_ITERATIONS}$zz$${'0'.repeat(128)}`), false);
    assert.equal(await verifyPassword('password', `pbkdf2$${PBKDF2_ITERATIONS}$${'0'.repeat(32)}$abcd`), false);
    assert.equal(needsPasswordRehash('not-a-valid-hash'), false);
});

test('dummy login hash uses the same valid PBKDF2 work factor', async () => {
    const [algorithm, iterations, salt, hash] = DUMMY_PASSWORD_HASH.split('$');

    assert.equal(algorithm, 'pbkdf2');
    assert.equal(Number(iterations), PBKDF2_ITERATIONS);
    assert.equal(Buffer.from(salt, 'hex').length, 16);
    assert.equal(Buffer.from(hash, 'hex').length, 64);
    assert.equal(await verifyPassword('not-the-dummy-password', DUMMY_PASSWORD_HASH), false);
});
