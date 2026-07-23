const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    RESTORE_CONFIRMATION,
    buildPostgresEnvironment,
    createBackup,
    describeDatabase,
    getMetadataPath,
    parseCommandLine,
    restoreBackup,
    verifyBackup
} = require('../scripts/postgresBackupRestore');

const DATABASE_URL = 'postgresql://backup_user:super-secret@db.example.test:5433/f1guesser?sslmode=require&channel_binding=require';

function createFakeToolRunner(calls) {
    return ({ tool, args }) => {
        calls.push({ tool, args: [...args] });
        if (tool === 'pg_dump' && args.includes('--version')) {
            return 'pg_dump (PostgreSQL) 17.5';
        }
        if (tool === 'pg_dump') {
            const fileArgument = args.find(argument => argument.startsWith('--file='));
            assert.ok(fileArgument, 'pg_dump must receive an output file.');
            fs.writeFileSync(fileArgument.slice('--file='.length), Buffer.from('valid-custom-dump-test-data'));
            return '';
        }
        if (tool === 'pg_restore' && args[0] === '--list') {
            return '; Archive created for test\n1; 0 0 TABLE public users backup_user';
        }
        if (tool === 'pg_restore') return '';
        throw new Error(`Unexpected tool call: ${tool}`);
    };
}

test('PostgreSQL URL is converted to PG environment variables without putting the password in descriptors', () => {
    const environment = buildPostgresEnvironment(DATABASE_URL, { PATH: '/usr/bin' });
    assert.equal(environment.PGHOST, 'db.example.test');
    assert.equal(environment.PGPORT, '5433');
    assert.equal(environment.PGUSER, 'backup_user');
    assert.equal(environment.PGPASSWORD, 'super-secret');
    assert.equal(environment.PGDATABASE, 'f1guesser');
    assert.equal(environment.PGSSLMODE, 'require');
    assert.equal(environment.PGCHANNELBINDING, 'require');

    const descriptor = describeDatabase(DATABASE_URL);
    assert.equal(descriptor.database, 'f1guesser');
    assert.equal(JSON.stringify(descriptor).includes('super-secret'), false);
});

test('command line parser supports flags, values and positional backup paths', () => {
    assert.deepEqual(
        parseCommandLine(['--file', 'backup.dump', '--confirm=RESTORE', '--no-clean', 'extra'], {
            booleanOptions: new Set(['no-clean'])
        }),
        {
            options: {
                file: 'backup.dump',
                confirm: 'RESTORE',
                'no-clean': true
            },
            positionals: ['extra']
        }
    );
});

test('backup creation writes a verified custom archive and password-free SHA metadata', async t => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-backup-unit-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const backupFile = path.join(temporaryDirectory, 'account-data.dump');
    const calls = [];
    const toolRunner = createFakeToolRunner(calls);
    const result = await createBackup({
        databaseUrl: DATABASE_URL,
        outputFile: backupFile,
        toolRunner,
        now: new Date('2026-07-23T12:00:00.000Z')
    });

    assert.equal(result.backupFile, backupFile);
    assert.ok(fs.statSync(backupFile).size > 0);
    assert.ok(fs.existsSync(getMetadataPath(backupFile)));
    assert.equal(result.metadata.source.database, 'f1guesser');
    assert.equal(JSON.stringify(result.metadata).includes('super-secret'), false);
    assert.match(result.metadata.sha256, /^[a-f0-9]{64}$/);
    assert.ok(calls.some(call => call.tool === 'pg_restore' && call.args[0] === '--list'));

    const verification = await verifyBackup({
        backupFile,
        toolRunner
    });
    assert.equal(verification.metadata.sha256, result.metadata.sha256);
    assert.equal(verification.tocEntries, 1);
});


test('backup verification rejects an archive changed after metadata generation', async t => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-backup-corrupt-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const backupFile = path.join(temporaryDirectory, 'account-data.dump');
    const toolRunner = createFakeToolRunner([]);
    await createBackup({ databaseUrl: DATABASE_URL, outputFile: backupFile, toolRunner });
    fs.appendFileSync(backupFile, 'tampered');

    await assert.rejects(
        verifyBackup({ backupFile, toolRunner }),
        /Dimensiunea backup-ului nu corespunde|Checksum-ul SHA-256/
    );
});

test('restore requires explicit confirmation and blocks the original source by default', async t => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-restore-unit-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const backupFile = path.join(temporaryDirectory, 'account-data.dump');
    const calls = [];
    const toolRunner = createFakeToolRunner(calls);
    await createBackup({ databaseUrl: DATABASE_URL, outputFile: backupFile, toolRunner });

    await assert.rejects(
        restoreBackup({
            databaseUrl: DATABASE_URL,
            backupFile,
            toolRunner
        }),
        /Confirmă explicit/
    );

    await assert.rejects(
        restoreBackup({
            databaseUrl: DATABASE_URL,
            backupFile,
            confirmation: RESTORE_CONFIRMATION,
            toolRunner
        }),
        /coincide cu baza sursă/
    );

    const result = await restoreBackup({
        databaseUrl: DATABASE_URL,
        backupFile,
        confirmation: RESTORE_CONFIRMATION,
        allowSourceTargetMatch: true,
        toolRunner
    });
    assert.equal(result.clean, true);

    const restoreCall = calls.find(call => call.tool === 'pg_restore' && call.args.includes('--single-transaction'));
    assert.ok(restoreCall);
    assert.ok(restoreCall.args.includes('--clean'));
    assert.ok(restoreCall.args.includes('--if-exists'));
    assert.ok(restoreCall.args.includes('--exit-on-error'));
    assert.equal(restoreCall.args.some(argument => argument.includes('super-secret')), false);
});
