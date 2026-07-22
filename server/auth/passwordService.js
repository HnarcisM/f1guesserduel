const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
// Valid precomputed hash used to keep unknown-account login checks computationally uniform.
const DUMMY_PASSWORD_HASH = [
    'pbkdf2',
    PBKDF2_ITERATIONS,
    '000102030405060708090a0b0c0d0e0f',
    '5137d3c000ceed35bad89109cb5165b5ad55936a4ab4a216a400525e5234e6c2f3512bc64ab6a0133d60abfdec7c55fa0dc08fb9272198d606bf31ce1a6cf92c'
].join('$');

async function derivePasswordHash(password, salt, iterations) {
    const hash = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);
    return hash.toString('hex');
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);

    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(password, storedHash) {
    if (typeof storedHash !== 'string') return false;

    const [algorithm, iterationsText, salt, expectedHash] = storedHash.split('$');
    if (algorithm !== 'pbkdf2' || !iterationsText || !salt || !expectedHash) return false;

    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;

    const actualHash = await derivePasswordHash(password, salt, iterations);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(actualHash, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = {
    DUMMY_PASSWORD_HASH,
    hashPassword,
    verifyPassword
};
