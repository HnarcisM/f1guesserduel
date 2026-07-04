const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    collectReleaseFiles,
    createReleaseZip,
    normalizePath,
    shouldIncludePath
} = require('../scripts/create-release-zip');

function writeFile(rootDir, relativePath, content = '') {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
}

function createTempProject() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-release-test-'));

    writeFile(rootDir, 'package.json', JSON.stringify({ name: 'F1GuesserDuel', version: '1.2.3' }));
    writeFile(rootDir, 'README.md', '# F1 Guesser Duel');
    writeFile(rootDir, '.env', 'SESSION_SECRET=secret');
    writeFile(rootDir, '.env.example', 'SESSION_SECRET=change-me');
    writeFile(rootDir, '.github/CODEOWNERS', '* @owner');
    writeFile(rootDir, '.git/config', '[core]');
    writeFile(rootDir, 'node_modules/example/index.js', 'module.exports = {};');
    writeFile(rootDir, 'dist/old-release.zip', 'old');
    writeFile(rootDir, 'public/index.html', '<!doctype html>');
    writeFile(rootDir, 'server/index.js', 'console.log("server");');
    writeFile(rootDir, 'data/drivers.json', '[]');
    writeFile(rootDir, 'data/rooms.json', '{}');
    writeFile(rootDir, 'data/f1.sqlite', 'sqlite');
    writeFile(rootDir, 'debug.log', 'log');
    writeFile(rootDir, 'local.patch', 'diff');
    writeFile(rootDir, 'test/example.test.js', 'test');

    return rootDir;
}

test('release path filter excludes runtime and development artifacts', () => {
    assert.equal(normalizePath('\\data\\rooms.json'), 'data/rooms.json');
    assert.equal(shouldIncludePath('public/index.html'), true);
    assert.equal(shouldIncludePath('.env.example'), true);
    assert.equal(shouldIncludePath('.env'), false);
    assert.equal(shouldIncludePath('data/rooms.json'), false);
    assert.equal(shouldIncludePath('data/f1.sqlite'), false);
    assert.equal(shouldIncludePath('node_modules/example/index.js'), false);
    assert.equal(shouldIncludePath('.git/config'), false);
    assert.equal(shouldIncludePath('dist/release.zip'), false);
    assert.equal(shouldIncludePath('debug.log'), false);
    assert.equal(shouldIncludePath('test/example.test.js'), false);
    assert.equal(shouldIncludePath('test/example.test.js', { includeTests: true }), true);
});

test('release collector includes only clean runtime files by default', () => {
    const rootDir = createTempProject();
    const files = collectReleaseFiles(rootDir).map(file => file.relativePath).sort();

    assert.deepEqual(files, [
        '.env.example',
        'README.md',
        'data/drivers.json',
        'package.json',
        'public/index.html',
        'server/index.js'
    ]);
});

test('release ZIP is created under dist without including excluded files', () => {
    const rootDir = createTempProject();
    const result = createReleaseZip(rootDir);
    const zipBuffer = fs.readFileSync(result.outputPath);
    const zipText = zipBuffer.toString('utf8');

    assert.equal(path.basename(result.outputPath), 'f1guesserduel-v1.2.3.zip');
    assert.ok(zipBuffer.subarray(0, 2).equals(Buffer.from('PK')));
    assert.match(zipText, /f1guesserduel-v1\.2\.3\/public\/index\.html/);
    assert.doesNotMatch(zipText, /node_modules/);
    assert.doesNotMatch(zipText, /data\/rooms\.json/);
    assert.doesNotMatch(zipText, /\.git\/config/);
});
