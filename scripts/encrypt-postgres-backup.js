/* c8 ignore file */
const fs = require('node:fs');
const path = require('node:path');
const {
    assertKnownOptions,
    parseCommandLine
} = require('./postgresBackupRestore');
const {
    encryptFile,
    parseEncryptionKey
} = require('./postgresBackupEncryption');

function removePlaintext(filePath) {
    fs.rmSync(filePath, { force: true });
}

async function main() {
    const { options } = parseCommandLine(process.argv.slice(2), {
        booleanOptions: new Set(['overwrite', 'keep-plaintext'])
    });
    assertKnownOptions(options, new Set(['file', 'key', 'overwrite', 'keep-plaintext']));

    if (!options.file || typeof options.file !== 'string') {
        throw new Error('--file trebuie specificat.');
    }

    const backupFile = path.resolve(options.file);
    const metadataFile = `${backupFile}.json`;
    const key = parseEncryptionKey(options.key || process.env.POSTGRES_BACKUP_ENCRYPTION_KEY);
    const encryptedBackup = encryptFile({
        inputFile: backupFile,
        outputFile: `${backupFile}.enc`,
        key,
        overwrite: options.overwrite === true
    });
    const encryptedMetadata = encryptFile({
        inputFile: metadataFile,
        outputFile: `${metadataFile}.enc`,
        key,
        overwrite: options.overwrite === true
    });

    if (options['keep-plaintext'] !== true) {
        removePlaintext(backupFile);
        removePlaintext(metadataFile);
    }

    console.log(`Backup criptat: ${encryptedBackup}`);
    console.log(`Metadata criptată: ${encryptedMetadata}`);
}

main().catch(error => {
    console.error(`Criptarea backupului PostgreSQL a eșuat: ${error.message}`);
    process.exitCode = 1;
});
