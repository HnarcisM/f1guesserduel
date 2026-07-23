const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAGIC = Buffer.from('F1BKUP01', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;

function parseEncryptionKey(value, label = 'POSTGRES_BACKUP_ENCRYPTION_KEY') {
    if (!value || typeof value !== 'string') {
        throw new Error(`${label} trebuie setată.`);
    }

    const normalized = value.trim();
    const key = Buffer.from(normalized, 'base64');
    if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
        throw new Error(`${label} trebuie să fie o cheie Base64 validă de exact 32 bytes.`);
    }
    return key;
}

function encryptBuffer(plaintext, key, { randomBytes = crypto.randomBytes } = {}) {
    const iv = randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([
        MAGIC,
        Buffer.from([iv.length, authTag.length]),
        iv,
        authTag,
        ciphertext
    ]);
}

function decryptBuffer(payload, key) {
    if (!Buffer.isBuffer(payload) || payload.length < MAGIC.length + 2 + IV_BYTES + TAG_BYTES) {
        throw new Error('Fișierul criptat este incomplet.');
    }
    if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error('Fișierul nu folosește formatul de backup criptat F1 Guesser.');
    }

    const ivLength = payload[MAGIC.length];
    const tagLength = payload[MAGIC.length + 1];
    if (ivLength !== IV_BYTES || tagLength !== TAG_BYTES) {
        throw new Error('Headerul fișierului criptat este invalid.');
    }

    const ivStart = MAGIC.length + 2;
    const tagStart = ivStart + ivLength;
    const ciphertextStart = tagStart + tagLength;
    const iv = payload.subarray(ivStart, tagStart);
    const authTag = payload.subarray(tagStart, ciphertextStart);
    const ciphertext = payload.subarray(ciphertextStart);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptFile({ inputFile, outputFile = `${inputFile}.enc`, key, overwrite = false }) {
    const sourcePath = path.resolve(inputFile);
    const destinationPath = path.resolve(outputFile);
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Fișierul de criptat nu există: ${sourcePath}`);
    }
    if (fs.existsSync(destinationPath) && !overwrite) {
        throw new Error(`Fișierul criptat există deja: ${destinationPath}`);
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    const encrypted = encryptBuffer(fs.readFileSync(sourcePath), key);
    fs.writeFileSync(destinationPath, encrypted, { mode: 0o600 });
    return destinationPath;
}

module.exports = {
    MAGIC,
    parseEncryptionKey,
    encryptBuffer,
    decryptBuffer,
    encryptFile
};
