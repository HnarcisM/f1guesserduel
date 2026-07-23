const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    decryptBuffer,
    encryptBuffer,
    encryptFile,
    parseEncryptionKey
} = require('../scripts/postgresBackupEncryption');

test('PostgreSQL backup encryption performs authenticated AES-256-GCM round trip', () => {
    const key = Buffer.alloc(32, 7);
    const plaintext = Buffer.from('backup contents with user data');
    const encrypted = encryptBuffer(plaintext, key, {
        randomBytes: size => Buffer.alloc(size, 3)
    });

    assert.notDeepEqual(encrypted, plaintext);
    assert.deepEqual(decryptBuffer(encrypted, key), plaintext);

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptBuffer(tampered, key));
});

test('PostgreSQL backup encryption requires an exact 32-byte Base64 key', () => {
    const valid = Buffer.alloc(32, 9).toString('base64');
    assert.equal(parseEncryptionKey(valid).length, 32);
    assert.throws(() => parseEncryptionKey('not-base64'), /exact 32 bytes/);
    assert.throws(() => parseEncryptionKey(''), /trebuie setată/);
});

test('PostgreSQL backup encryption writes a protected file without overwriting by default', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-backup-encryption-'));
    const inputFile = path.join(directory, 'backup.dump');
    const outputFile = `${inputFile}.enc`;
    const key = Buffer.alloc(32, 4);

    try {
        fs.writeFileSync(inputFile, 'database backup');
        encryptFile({ inputFile, outputFile, key });
        assert.equal(decryptBuffer(fs.readFileSync(outputFile), key).toString(), 'database backup');
        assert.throws(() => encryptFile({ inputFile, outputFile, key }), /există deja/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
