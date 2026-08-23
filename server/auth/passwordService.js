const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 220000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const SALT_HEX_PATTERN = /^[a-f0-9]{32}$/i;
const HASH_HEX_PATTERN = /^[a-f0-9]{128}$/i;
// Valid precomputed hash used to keep unknown-account login checks computationally uniform.
const DUMMY_PASSWORD_HASH = [
    'pbkdf2',
    PBKDF2_ITERATIONS,
    '000102030405060708090a0b0c0d0e0f',
    '8e70e0082a79fbd409050eda7216f5c55d8decd88ae9919ea772c8b2b4bdaf25a69003db84ca6d06bade98551e99b4490395c6a97dae92503fcfbb7edf384c4f'
].join('$');

function parseStoredPasswordHash(storedHash) {
    if (typeof storedHash !== 'string') return null;

    const parts = storedHash.split('$');
    if (parts.length !== 4) return null;

    const [algorithm, iterationsText, salt, expectedHash] = parts;
    if (algorithm !== 'pbkdf2' || !/^\d+$/.test(iterationsText)) return null;
    if (!SALT_HEX_PATTERN.test(salt) || !HASH_HEX_PATTERN.test(expectedHash)) return null;

    const iterations = Number(iterationsText);
    if (!Number.isSafeInteger(iterations) || iterations <= 0) return null;

    return {
        algorithm,
        iterations,
        salt,
        expectedHash
    };
}

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
    const parsedHash = parseStoredPasswordHash(storedHash);
    if (!parsedHash) return false;

    const actualHash = await derivePasswordHash(password, parsedHash.salt, parsedHash.iterations);
    const expectedBuffer = Buffer.from(parsedHash.expectedHash, 'hex');
    const actualBuffer = Buffer.from(actualHash, 'hex');

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function needsPasswordRehash(storedHash) {
    const parsedHash = parseStoredPasswordHash(storedHash);
    return Boolean(parsedHash && parsedHash.iterations < PBKDF2_ITERATIONS);
}

module.exports = {
    DUMMY_PASSWORD_HASH,
    PBKDF2_ITERATIONS,
    hashPassword,
    needsPasswordRehash,
    verifyPassword
};
