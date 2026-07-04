const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEFAULT_IGNORED_DIRECTORIES = new Set([
    '.git',
    '.cache',
    '.nyc_output',
    '.parcel-cache',
    '.pytest_cache',
    '.turbo',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results'
]);

const DEFAULT_IGNORED_EXACT_PATHS = new Set([
    '.env',
    'data/rooms.json'
]);

const TEMP_FILE_PATTERNS = [
    /(^|\/|\\)\.DS_Store$/,
    /(^|\/|\\)Thumbs\.db$/i,
    /\.bak$/i,
    /\.backup$/i,
    /\.old$/i,
    /\.orig$/i,
    /\.rej$/i,
    /\.tmp$/i,
    /\.temp$/i,
    /\.swp$/i,
    /\.log$/i,
    /^npm-debug\.log/i,
    /^yarn-debug\.log/i,
    /^yarn-error\.log/i,
    /^pnpm-debug\.log/i
];

const ROOT_ARTIFACT_PATTERNS = [
    /\.patch$/i,
    /\.zip$/i
];

let crc32Table = null;

function normalizePath(inputPath) {
    return String(inputPath || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function sanitizeName(value) {
    return String(value || 'release')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'release';
}

function isRuntimeDataFile(relativePath) {
    return /^data\/.*\.sqlite(?:-(?:shm|wal))?$/i.test(relativePath);
}

function isTemporaryFile(relativePath) {
    const basename = path.posix.basename(relativePath);
    return TEMP_FILE_PATTERNS.some(pattern => pattern.test(relativePath) || pattern.test(basename));
}

function isRootArtifact(relativePath) {
    return !relativePath.includes('/') && ROOT_ARTIFACT_PATTERNS.some(pattern => pattern.test(relativePath));
}

function shouldIncludePath(relativePath, options = {}) {
    const normalizedPath = normalizePath(relativePath);

    if (!normalizedPath) return false;
    if (DEFAULT_IGNORED_EXACT_PATHS.has(normalizedPath)) return false;
    if (isRuntimeDataFile(normalizedPath)) return false;
    if (isTemporaryFile(normalizedPath)) return false;
    if (isRootArtifact(normalizedPath)) return false;

    const parts = normalizedPath.split('/');
    if (!options.includeTests && parts[0] === 'test') return false;
    if (!options.includeGithub && parts[0] === '.github') return false;

    return !parts.some(part => DEFAULT_IGNORED_DIRECTORIES.has(part));
}

function collectReleaseFiles(rootDir, options = {}) {
    const files = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            const relativePath = normalizePath(path.relative(rootDir, absolutePath));

            if (!shouldIncludePath(relativePath, options)) {
                continue;
            }

            if (entry.isDirectory()) {
                walk(absolutePath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            files.push({
                absolutePath,
                relativePath
            });
        }
    }

    walk(rootDir);
    return files;
}

function createCrc32Table() {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i += 1) {
        let crc = i;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
        table[i] = crc >>> 0;
    }

    return table;
}

function crc32(buffer) {
    if (!crc32Table) {
        crc32Table = createCrc32Table();
    }

    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2);
    const dosDate =
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate();

    return { dosDate, dosTime };
}

function createLocalFileHeader({ fileNameBuffer, crc, compressedSize, uncompressedSize, dosDate, dosTime, compressionMethod }) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(compressionMethod, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressedSize, 18);
    header.writeUInt32LE(uncompressedSize, 22);
    header.writeUInt16LE(fileNameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    return header;
}

function createCentralDirectoryHeader({
    fileNameBuffer,
    crc,
    compressedSize,
    uncompressedSize,
    dosDate,
    dosTime,
    compressionMethod,
    localHeaderOffset,
    mode
}) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(compressionMethod, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressedSize, 20);
    header.writeUInt32LE(uncompressedSize, 24);
    header.writeUInt16LE(fileNameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, 38);
    header.writeUInt32LE(localHeaderOffset, 42);
    return header;
}

function createEndOfCentralDirectory({ entryCount, centralDirectorySize, centralDirectoryOffset }) {
    const header = Buffer.alloc(22);
    header.writeUInt32LE(0x06054b50, 0);
    header.writeUInt16LE(0, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(entryCount, 8);
    header.writeUInt16LE(entryCount, 10);
    header.writeUInt32LE(centralDirectorySize, 12);
    header.writeUInt32LE(centralDirectoryOffset, 16);
    header.writeUInt16LE(0, 20);
    return header;
}

function createZipBuffer(files, options = {}) {
    const rootFolder = normalizePath(options.rootFolder || 'release');
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const data = fs.readFileSync(file.absolutePath);
        const compressedData = zlib.deflateRawSync(data, { level: 9 });
        const useStoredMethod = compressedData.length >= data.length;
        const payload = useStoredMethod ? data : compressedData;
        const compressionMethod = useStoredMethod ? 0 : 8;
        const stats = fs.statSync(file.absolutePath);
        const zipPath = `${rootFolder}/${normalizePath(file.relativePath)}`;
        const fileNameBuffer = Buffer.from(zipPath, 'utf8');
        const checksum = crc32(data);
        const { dosDate, dosTime } = toDosDateTime(stats.mtime);
        const localHeaderOffset = offset;

        const localHeader = createLocalFileHeader({
            fileNameBuffer,
            crc: checksum,
            compressedSize: payload.length,
            uncompressedSize: data.length,
            dosDate,
            dosTime,
            compressionMethod
        });

        localParts.push(localHeader, fileNameBuffer, payload);
        offset += localHeader.length + fileNameBuffer.length + payload.length;

        const centralHeader = createCentralDirectoryHeader({
            fileNameBuffer,
            crc: checksum,
            compressedSize: payload.length,
            uncompressedSize: data.length,
            dosDate,
            dosTime,
            compressionMethod,
            localHeaderOffset,
            mode: stats.mode
        });

        centralParts.push(centralHeader, fileNameBuffer);
    }

    const centralDirectoryOffset = offset;
    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
    const endOfCentralDirectory = createEndOfCentralDirectory({
        entryCount: files.length,
        centralDirectorySize,
        centralDirectoryOffset
    });

    return Buffer.concat([
        ...localParts,
        ...centralParts,
        endOfCentralDirectory
    ]);
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function parseCliArgs(argv) {
    const options = {
        includeTests: false,
        includeGithub: false,
        dryRun: false,
        out: null,
        name: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--with-tests') {
            options.includeTests = true;
        } else if (arg === '--with-github') {
            options.includeGithub = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--out') {
            options.out = argv[index + 1] || null;
            index += 1;
        } else if (arg === '--name') {
            options.name = argv[index + 1] || null;
            index += 1;
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else {
            throw new Error(`Argument necunoscut: ${arg}`);
        }
    }

    return options;
}

function printHelp() {
    console.log(`Utilizare:\n  npm run release:zip\n  node scripts/create-release-zip.js [opțiuni]\n\nOpțiuni:\n  --with-tests      Include folderul test/ în arhiva de release.\n  --with-github     Include folderul .github/ în arhiva de release.\n  --out <path>      Setează calea fișierului ZIP generat.\n  --name <name>     Setează numele folderului rădăcină din arhivă.\n  --dry-run         Afișează fișierele incluse fără să creeze ZIP-ul.\n`);
}

function createReleaseZip(rootDir, options = {}) {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const packageName = sanitizeName(packageJson.name || 'f1guesserduel');
    const releaseName = sanitizeName(options.name || `${packageName}-v${packageJson.version || '0.0.0'}`);
    const outputPath = path.resolve(rootDir, options.out || path.join('dist', `${releaseName}.zip`));
    const files = collectReleaseFiles(rootDir, options);
    const totalInputBytes = files.reduce((total, file) => total + fs.statSync(file.absolutePath).size, 0);

    if (options.dryRun) {
        console.log(`[release] Dry run pentru ${releaseName}: ${files.length} fișiere, ${formatBytes(totalInputBytes)} înainte de compresie.`);
        for (const file of files) {
            console.log(file.relativePath);
        }
        return { files, outputPath, releaseName, totalInputBytes, outputBytes: 0 };
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const zipBuffer = createZipBuffer(files, { rootFolder: releaseName });
    fs.writeFileSync(outputPath, zipBuffer);

    return {
        files,
        outputPath,
        releaseName,
        totalInputBytes,
        outputBytes: zipBuffer.length
    };
}

function main() {
    const rootDir = path.resolve(__dirname, '..');
    const options = parseCliArgs(process.argv.slice(2));

    if (options.help) {
        printHelp();
        return;
    }

    const result = createReleaseZip(rootDir, options);

    if (!options.dryRun) {
        console.log(`[release] Arhivă creată: ${path.relative(rootDir, result.outputPath)}`);
        console.log(`[release] Fișiere incluse: ${result.files.length}`);
        console.log(`[release] Dimensiune sursă: ${formatBytes(result.totalInputBytes)}`);
        console.log(`[release] Dimensiune ZIP: ${formatBytes(result.outputBytes)}`);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[release] ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    collectReleaseFiles,
    createReleaseZip,
    createZipBuffer,
    normalizePath,
    shouldIncludePath
};
