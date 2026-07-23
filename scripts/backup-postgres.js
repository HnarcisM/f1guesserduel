/* c8 ignore file */
const path = require('node:path');
const {
    assertKnownOptions,
    createBackup,
    createDefaultBackupFile,
    describeDatabase,
    parseCommandLine
} = require('./postgresBackupRestore');

async function main() {
    const { options } = parseCommandLine(process.argv.slice(2), {
        booleanOptions: new Set(['overwrite'])
    });
    assertKnownOptions(options, new Set([
        'database-url',
        'docker-image',
        'docker-network',
        'output',
        'overwrite'
    ]));

    const databaseUrl = options['database-url']
        || process.env.POSTGRES_BACKUP_DATABASE_URL
        || process.env.DATABASE_URL;
    const backupDirectory = process.env.POSTGRES_BACKUP_DIR
        ? path.resolve(process.env.POSTGRES_BACKUP_DIR)
        : path.join(process.cwd(), 'backups', 'postgres');
    const outputFile = options.output
        ? path.resolve(options.output)
        : createDefaultBackupFile({ backupDirectory });
    const dockerImage = options['docker-image']
        || process.env.POSTGRES_TOOLS_DOCKER_IMAGE
        || '';
    const dockerNetwork = options['docker-network']
        || process.env.POSTGRES_TOOLS_DOCKER_NETWORK
        || 'host';

    const result = await createBackup({
        databaseUrl,
        outputFile,
        overwrite: options.overwrite === true,
        dockerImage,
        dockerNetwork
    });
    const source = describeDatabase(databaseUrl);

    console.log(`Backup PostgreSQL creat: ${result.backupFile}`);
    console.log(`Metadata și checksum: ${result.metadataFile}`);
    console.log(`Sursă: ${source.user ? `${source.user}@` : ''}${source.host}:${source.port}/${source.database}`);
    console.log(`Dimensiune: ${result.metadata.bytes} bytes`);
    console.log(`SHA-256: ${result.metadata.sha256}`);
}

main().catch(error => {
    console.error(`Backup PostgreSQL eșuat: ${error.message}`);
    process.exitCode = 1;
});
