/* c8 ignore file */
const fs = require('node:fs');
const path = require('node:path');
const {
    assertKnownOptions,
    parseCommandLine
} = require('./postgresBackupRestore');
const {
    decryptBuffer,
    parseEncryptionKey
} = require('./postgresBackupEncryption');

async function main() {
    const { options } = parseCommandLine(process.argv.slice(2), {
        booleanOptions: new Set(['overwrite'])
    });
    assertKnownOptions(options, new Set(['file', 'key', 'output', 'overwrite']));

    if (!options.file || typeof options.file !== 'string') {
        throw new Error('--file trebuie specificat.');
    }

    const inputFile = path.resolve(options.file);
    if (!fs.existsSync(inputFile)) {
        throw new Error(`Fișierul criptat nu există: ${inputFile}`);
    }
    const defaultOutput = inputFile.endsWith('.enc') ? inputFile.slice(0, -4) : `${inputFile}.decrypted`;
    const outputFile = path.resolve(options.output || defaultOutput);
    if (fs.existsSync(outputFile) && options.overwrite !== true) {
        throw new Error(`Fișierul de ieșire există deja: ${outputFile}`);
    }

    const key = parseEncryptionKey(options.key || process.env.POSTGRES_BACKUP_ENCRYPTION_KEY);
    const plaintext = decryptBuffer(fs.readFileSync(inputFile), key);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, plaintext, { mode: 0o600 });
    console.log(`Backup decriptat: ${outputFile}`);
}

main().catch(error => {
    console.error(`Decriptarea backupului PostgreSQL a eșuat: ${error.message}`);
    process.exitCode = 1;
});
