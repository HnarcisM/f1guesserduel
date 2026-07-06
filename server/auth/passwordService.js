const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

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
    hashPassword,
    verifyPassword
};
