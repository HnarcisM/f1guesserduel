/* c8 ignore file */
const path = require('node:path');
const {
    assertKnownOptions,
    parseCommandLine,
    verifyBackup
} = require('./postgresBackupRestore');

async function main() {
    const { options, positionals } = parseCommandLine(process.argv.slice(2));
    assertKnownOptions(options, new Set([
        'database-url',
        'docker-image',
        'docker-network',
        'file'
    ]));

    const backupFile = options.file || positionals[0];
    if (!backupFile) throw new Error('Specifică backup-ul cu --file <cale>.');

    const databaseUrl = options['database-url']
        || process.env.POSTGRES_BACKUP_DATABASE_URL
        || process.env.DATABASE_URL
        || null;
    const result = await verifyBackup({
        backupFile: path.resolve(backupFile),
        databaseUrl,
        dockerImage: options['docker-image'] || process.env.POSTGRES_TOOLS_DOCKER_IMAGE || '',
        dockerNetwork: options['docker-network'] || process.env.POSTGRES_TOOLS_DOCKER_NETWORK || 'host'
    });

    console.log(`Backup valid: ${result.backupFile}`);
    console.log(`Dimensiune: ${result.bytes} bytes`);
    console.log(`Intrări pg_restore: ${result.tocEntries}`);
    console.log(result.metadataPath
        ? `Metadata verificată: ${result.metadataPath}`
        : 'Metadata lipsește; structura arhivei pg_dump a fost totuși verificată.');
}

main().catch(error => {
    console.error(`Verificare backup PostgreSQL eșuată: ${error.message}`);
    process.exitCode = 1;
});
