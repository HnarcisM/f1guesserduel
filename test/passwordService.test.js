const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../server/auth/passwordService');

test('hashPassword returns a promise and stores pbkdf2 metadata', async () => {
    const hashPromise = hashPassword('CorrectHorseBatteryStaple1!');

    assert.equal(typeof hashPromise.then, 'function');

    const storedHash = await hashPromise;
    const [algorithm, iterationsText, salt, hash] = storedHash.split('$');

    assert.equal(algorithm, 'pbkdf2');
    assert.equal(Number(iterationsText), 120000);
    assert.match(salt, /^[a-f0-9]{32}$/);
    assert.match(hash, /^[a-f0-9]{128}$/);
});

test('verifyPassword accepts only the matching password', async () => {
    const storedHash = await hashPassword('CorrectHorseBatteryStaple1!');

    assert.equal(await verifyPassword('CorrectHorseBatteryStaple1!', storedHash), true);
    assert.equal(await verifyPassword('wrong-password', storedHash), false);
});

test('verifyPassword rejects malformed hashes safely', async () => {
    assert.equal(await verifyPassword('password', null), false);
    assert.equal(await verifyPassword('password', 'not-a-valid-hash'), false);
    assert.equal(await verifyPassword('password', 'pbkdf2$0$salt$hash'), false);
    assert.equal(await verifyPassword('password', 'pbkdf2$abc$salt$hash'), false);
});
