/* c8 ignore file */
const path = require('node:path');
const {
    RESTORE_CONFIRMATION,
    assertKnownOptions,
    parseCommandLine,
    restoreBackup
} = require('./postgresBackupRestore');

async function main() {
    const { options, positionals } = parseCommandLine(process.argv.slice(2), {
        booleanOptions: new Set(['allow-source-target-match', 'no-clean'])
    });
    assertKnownOptions(options, new Set([
        'allow-source-target-match',
        'confirm',
        'database-url',
        'docker-image',
        'docker-network',
        'file',
        'no-clean'
    ]));

    const backupFile = options.file || positionals[0];
    if (!backupFile) throw new Error('Specifică backup-ul cu --file <cale>.');

    const databaseUrl = options['database-url']
        || process.env.POSTGRES_RESTORE_DATABASE_URL
        || process.env.DATABASE_URL;
    const confirmation = options.confirm || process.env.POSTGRES_RESTORE_CONFIRM;
    const result = await restoreBackup({
        databaseUrl,
        backupFile: path.resolve(backupFile),
        confirmation,
        clean: options['no-clean'] !== true,
        allowSourceTargetMatch: options['allow-source-target-match'] === true,
        dockerImage: options['docker-image'] || process.env.POSTGRES_TOOLS_DOCKER_IMAGE || '',
        dockerNetwork: options['docker-network'] || process.env.POSTGRES_TOOLS_DOCKER_NETWORK || 'host'
    });

    console.log(`Restaurare PostgreSQL finalizată în ${result.target.host}:${result.target.port}/${result.target.database}.`);
    console.log(`Backup verificat înainte de restore: ${result.backupFile}`);
    console.log(`Mod clean: ${result.clean ? 'activ' : 'dezactivat'}`);
}

main().catch(error => {
    console.error(`Restaurare PostgreSQL eșuată: ${error.message}`);
    if (!String(error.message).includes(RESTORE_CONFIRMATION)) {
        console.error(`Pentru o restaurare intenționată folosește --confirm ${RESTORE_CONFIRMATION}.`);
    }
    process.exitCode = 1;
});
