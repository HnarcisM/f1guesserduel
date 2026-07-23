const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKUP_METADATA_SCHEMA_VERSION = 1;
const RESTORE_CONFIRMATION = 'RESTORE';
const DEFAULT_DOCKER_NETWORK = 'host';
const MAX_TOOL_OUTPUT_BYTES = 16 * 1024 * 1024;

function parseCommandLine(argv = [], { booleanOptions = new Set() } = {}) {
    const options = {};
    const positionals = [];

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') {
            positionals.push(...argv.slice(index + 1));
            break;
        }
        if (!argument.startsWith('--')) {
            positionals.push(argument);
            continue;
        }

        const separatorIndex = argument.indexOf('=');
        if (separatorIndex > 2) {
            options[argument.slice(2, separatorIndex)] = argument.slice(separatorIndex + 1);
            continue;
        }

        const name = argument.slice(2);
        if (booleanOptions.has(name)) {
            options[name] = true;
            continue;
        }

        const nextArgument = argv[index + 1];
        if (nextArgument && !nextArgument.startsWith('--')) {
            options[name] = nextArgument;
            index += 1;
        } else {
            options[name] = true;
        }
    }

    return { options, positionals };
}

function assertKnownOptions(options, allowedOptions) {
    const unknownOptions = Object.keys(options).filter(option => !allowedOptions.has(option));
    if (unknownOptions.length > 0) {
        throw new Error(`Opțiuni necunoscute: ${unknownOptions.map(option => `--${option}`).join(', ')}`);
    }
}

function parsePostgresUrl(value, label = 'DATABASE_URL') {
    if (!value || typeof value !== 'string') {
        throw new Error(`${label} trebuie setat.`);
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error(`${label} nu este un URL PostgreSQL valid.`);
    }

    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
        throw new Error(`${label} trebuie să folosească schema postgres:// sau postgresql://.`);
    }

    const database = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
    if (!parsedUrl.hostname || !database) {
        throw new Error(`${label} trebuie să conțină hostul și numele bazei de date.`);
    }

    return {
        url: parsedUrl,
        host: parsedUrl.hostname,
        port: parsedUrl.port || '5432',
        user: decodeURIComponent(parsedUrl.username || ''),
        password: decodeURIComponent(parsedUrl.password || ''),
        database,
        sslMode: parsedUrl.searchParams.get('sslmode') || ''
    };
}

function buildPostgresEnvironment(databaseUrl, baseEnvironment = process.env) {
    const parsed = parsePostgresUrl(databaseUrl);
    const environment = {
        ...baseEnvironment,
        PGHOST: parsed.host,
        PGPORT: parsed.port,
        PGDATABASE: parsed.database
    };
    delete environment.DATABASE_URL;
    delete environment.POSTGRES_BACKUP_DATABASE_URL;
    delete environment.POSTGRES_RESTORE_DATABASE_URL;

    if (parsed.user) environment.PGUSER = parsed.user;
    if (parsed.password) environment.PGPASSWORD = parsed.password;

    const environmentParameters = new Map([
        ['sslmode', 'PGSSLMODE'],
        ['channel_binding', 'PGCHANNELBINDING'],
        ['connect_timeout', 'PGCONNECT_TIMEOUT'],
        ['application_name', 'PGAPPNAME'],
        ['options', 'PGOPTIONS'],
        ['target_session_attrs', 'PGTARGETSESSIONATTRS']
    ]);
    for (const [queryParameter, environmentVariable] of environmentParameters) {
        const parameterValue = parsed.url.searchParams.get(queryParameter);
        if (parameterValue) environment[environmentVariable] = parameterValue;
    }

    return environment;
}

function describeDatabase(databaseUrl) {
    const parsed = parsePostgresUrl(databaseUrl);
    return {
        host: parsed.host,
        port: parsed.port,
        database: parsed.database,
        user: parsed.user || null,
        sslMode: parsed.sslMode || null
    };
}

function isSameDatabase(source, target) {
    if (!source || !target) return false;
    return String(source.host || '').toLowerCase() === String(target.host || '').toLowerCase()
        && String(source.port || '5432') === String(target.port || '5432')
        && String(source.database || '') === String(target.database || '');
}

function getMetadataPath(backupFile) {
    return `${backupFile}.json`;
}

function createDefaultBackupFile({ backupDirectory = path.join(process.cwd(), 'backups', 'postgres'), now = new Date() } = {}) {
    const timestamp = now.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
    return path.join(backupDirectory, `f1guesser-postgres-${timestamp}.dump`);
}

function sanitizeToolOutput(output, secrets = []) {
    let sanitized = String(output || '').trim();
    for (const secret of secrets) {
        if (secret) sanitized = sanitized.split(secret).join('[REDACTED]');
    }
    return sanitized;
}

function runProcess(command, args, { environment, secrets = [] } = {}) {
    const result = spawnSync(command, args, {
        env: environment,
        encoding: 'utf8',
        maxBuffer: MAX_TOOL_OUTPUT_BYTES,
        windowsHide: true
    });

    if (result.error) {
        if (result.error.code === 'ENOENT') {
            throw new Error(`Nu am găsit executabilul '${command}'. Instalează PostgreSQL client tools sau configurează POSTGRES_TOOLS_DOCKER_IMAGE.`);
        }
        throw result.error;
    }

    if (result.status !== 0) {
        const details = sanitizeToolOutput(result.stderr || result.stdout, secrets);
        throw new Error(`${command} a eșuat cu codul ${result.status}${details ? `: ${details}` : '.'}`);
    }

    return String(result.stdout || '').trim();
}

function getNativeToolBinary(tool, environment) {
    const overrides = {
        pg_dump: 'POSTGRES_PG_DUMP_BINARY',
        pg_restore: 'POSTGRES_PG_RESTORE_BINARY'
    };
    return environment[overrides[tool]] || tool;
}

function executePostgresTool({
    tool,
    args,
    databaseUrl,
    dockerImage = '',
    dockerNetwork = DEFAULT_DOCKER_NETWORK,
    mounts = [],
    environment = process.env
}) {
    const parsed = databaseUrl ? parsePostgresUrl(databaseUrl) : null;
    const postgresEnvironment = databaseUrl
        ? buildPostgresEnvironment(databaseUrl, environment)
        : { ...environment };
    const secrets = [databaseUrl, parsed?.password];

    if (!dockerImage) {
        return runProcess(getNativeToolBinary(tool, postgresEnvironment), args, {
            environment: postgresEnvironment,
            secrets
        });
    }

    const dockerArgs = ['run', '--rm'];
    if (dockerNetwork) dockerArgs.push('--network', dockerNetwork);
    if (typeof process.getuid === 'function' && typeof process.getgid === 'function') {
        dockerArgs.push('--user', `${process.getuid()}:${process.getgid()}`);
    }

    const postgresEnvironmentNames = Object.keys(postgresEnvironment)
        .filter(name => name.startsWith('PG') && postgresEnvironment[name] !== undefined);
    for (const name of postgresEnvironmentNames) dockerArgs.push('--env', name);

    for (const mount of mounts) {
        const hostPath = path.resolve(mount.hostPath);
        const suffix = mount.readOnly ? ':ro' : '';
        dockerArgs.push('--volume', `${hostPath}:${mount.containerPath}${suffix}`);
    }

    dockerArgs.push(dockerImage, tool, ...args);
    return runProcess('docker', dockerArgs, {
        environment: postgresEnvironment,
        secrets
    });
}

async function calculateFileSha256(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

function resolveToolFilePath(filePath, containerDirectory = '/backup') {
    return path.posix.join(containerDirectory, path.basename(filePath));
}

async function verifyBackup({
    backupFile,
    databaseUrl,
    dockerImage = '',
    dockerNetwork = DEFAULT_DOCKER_NETWORK,
    toolRunner = executePostgresTool
}) {
    const absoluteBackupFile = path.resolve(backupFile);
    const stats = fs.statSync(absoluteBackupFile, { throwIfNoEntry: false });
    if (!stats?.isFile() || stats.size <= 0) {
        throw new Error(`Backup-ul nu există sau este gol: ${absoluteBackupFile}`);
    }

    const metadataPath = getMetadataPath(absoluteBackupFile);
    let metadata = null;
    if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.schemaVersion !== BACKUP_METADATA_SCHEMA_VERSION) {
            throw new Error(`Versiune metadata backup nesuportată: ${metadata.schemaVersion}`);
        }
        if (Number(metadata.bytes) !== stats.size) {
            throw new Error('Dimensiunea backup-ului nu corespunde metadatelor.');
        }
        const checksum = await calculateFileSha256(absoluteBackupFile);
        if (checksum !== metadata.sha256) {
            throw new Error('Checksum-ul SHA-256 al backup-ului nu corespunde metadatelor.');
        }
    }

    const backupDirectory = path.dirname(absoluteBackupFile);
    const toolBackupFile = dockerImage
        ? resolveToolFilePath(absoluteBackupFile)
        : absoluteBackupFile;
    const toc = toolRunner({
        tool: 'pg_restore',
        args: ['--list', toolBackupFile],
        databaseUrl,
        dockerImage,
        dockerNetwork,
        mounts: dockerImage ? [{ hostPath: backupDirectory, containerPath: '/backup', readOnly: true }] : []
    });

    return {
        backupFile: absoluteBackupFile,
        metadataPath: fs.existsSync(metadataPath) ? metadataPath : null,
        metadata,
        bytes: stats.size,
        tocEntries: String(toc || '').split('\n').filter(line => line && !line.startsWith(';')).length
    };
}

async function createBackup({
    databaseUrl,
    outputFile = createDefaultBackupFile(),
    overwrite = false,
    dockerImage = '',
    dockerNetwork = DEFAULT_DOCKER_NETWORK,
    toolRunner = executePostgresTool,
    now = new Date()
}) {
    parsePostgresUrl(databaseUrl, 'POSTGRES_BACKUP_DATABASE_URL/DATABASE_URL');
    const absoluteOutputFile = path.resolve(outputFile);
    const outputDirectory = path.dirname(absoluteOutputFile);
    const metadataPath = getMetadataPath(absoluteOutputFile);

    if (!overwrite && (fs.existsSync(absoluteOutputFile) || fs.existsSync(metadataPath))) {
        throw new Error(`Backup-ul există deja: ${absoluteOutputFile}. Folosește --overwrite numai dacă intenția este explicită.`);
    }

    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    const partialFile = `${absoluteOutputFile}.partial-${process.pid}-${Date.now()}`;
    const partialMetadataFile = `${metadataPath}.partial-${process.pid}-${Date.now()}`;
    const toolPartialFile = dockerImage ? resolveToolFilePath(partialFile) : partialFile;

    try {
        toolRunner({
            tool: 'pg_dump',
            args: [
                '--format=custom',
                '--compress=9',
                '--no-owner',
                '--no-privileges',
                '--lock-wait-timeout=5000',
                `--file=${toolPartialFile}`
            ],
            databaseUrl,
            dockerImage,
            dockerNetwork,
            mounts: dockerImage ? [{ hostPath: outputDirectory, containerPath: '/backup' }] : []
        });

        const partialStats = fs.statSync(partialFile, { throwIfNoEntry: false });
        if (!partialStats?.isFile() || partialStats.size <= 0) {
            throw new Error('pg_dump nu a generat un fișier de backup valid.');
        }

        await verifyBackup({
            backupFile: partialFile,
            databaseUrl,
            dockerImage,
            dockerNetwork,
            toolRunner
        });

        const pgDumpVersion = toolRunner({
            tool: 'pg_dump',
            args: ['--version'],
            databaseUrl,
            dockerImage,
            dockerNetwork
        });
        const sha256 = await calculateFileSha256(partialFile);
        const metadata = {
            schemaVersion: BACKUP_METADATA_SCHEMA_VERSION,
            application: 'F1GuesserDuel',
            createdAt: now.toISOString(),
            format: 'postgres-custom',
            fileName: path.basename(absoluteOutputFile),
            bytes: partialStats.size,
            sha256,
            source: describeDatabase(databaseUrl),
            pgDumpVersion
        };

        fs.writeFileSync(partialMetadataFile, `${JSON.stringify(metadata, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600
        });
        if (overwrite) {
            fs.rmSync(absoluteOutputFile, { force: true });
            fs.rmSync(metadataPath, { force: true });
        }
        fs.renameSync(partialFile, absoluteOutputFile);
        fs.renameSync(partialMetadataFile, metadataPath);

        return {
            backupFile: absoluteOutputFile,
            metadataFile: metadataPath,
            metadata
        };
    } catch (error) {
        fs.rmSync(partialFile, { force: true });
        fs.rmSync(partialMetadataFile, { force: true });
        throw error;
    }
}

async function restoreBackup({
    databaseUrl,
    backupFile,
    confirmation,
    clean = true,
    allowSourceTargetMatch = false,
    dockerImage = '',
    dockerNetwork = DEFAULT_DOCKER_NETWORK,
    toolRunner = executePostgresTool
}) {
    if (confirmation !== RESTORE_CONFIRMATION) {
        throw new Error(`Restaurarea este distructivă. Confirmă explicit cu --confirm ${RESTORE_CONFIRMATION}.`);
    }

    const target = describeDatabase(databaseUrl);
    const verification = await verifyBackup({
        backupFile,
        databaseUrl,
        dockerImage,
        dockerNetwork,
        toolRunner
    });

    if (!allowSourceTargetMatch && isSameDatabase(verification.metadata?.source, target)) {
        throw new Error('Ținta restaurării coincide cu baza sursă din metadata. Folosește --allow-source-target-match numai după verificarea manuală a țintei.');
    }

    const absoluteBackupFile = path.resolve(backupFile);
    const backupDirectory = path.dirname(absoluteBackupFile);
    const toolBackupFile = dockerImage
        ? resolveToolFilePath(absoluteBackupFile)
        : absoluteBackupFile;
    const args = [
        `--dbname=${target.database}`,
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-privileges'
    ];
    if (clean) args.push('--clean', '--if-exists');
    args.push(toolBackupFile);

    toolRunner({
        tool: 'pg_restore',
        args,
        databaseUrl,
        dockerImage,
        dockerNetwork,
        mounts: dockerImage ? [{ hostPath: backupDirectory, containerPath: '/backup', readOnly: true }] : []
    });

    return {
        backupFile: absoluteBackupFile,
        target,
        clean,
        verifiedBytes: verification.bytes,
        tocEntries: verification.tocEntries
    };
}

module.exports = {
    BACKUP_METADATA_SCHEMA_VERSION,
    RESTORE_CONFIRMATION,
    assertKnownOptions,
    buildPostgresEnvironment,
    calculateFileSha256,
    createBackup,
    createDefaultBackupFile,
    describeDatabase,
    executePostgresTool,
    getMetadataPath,
    isSameDatabase,
    parseCommandLine,
    parsePostgresUrl,
    restoreBackup,
    sanitizeToolOutput,
    verifyBackup
};
