const crypto = require('crypto');

const PBKDF2_ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
        .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
        .toString('hex');

    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
    if (typeof storedHash !== 'string') return false;

    const [algorithm, iterationsText, salt, expectedHash] = storedHash.split('$');
    if (algorithm !== 'pbkdf2' || !iterationsText || !salt || !expectedHash) return false;

    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;

    const actualHash = crypto
        .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
        .toString('hex');

    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(actualHash, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = {
    hashPassword,
    verifyPassword
};
