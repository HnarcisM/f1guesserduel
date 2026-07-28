const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    cleanupPythonCache,
    formatCleanupResult
} = require('../scripts/cleanup-python-cache');

function writeFile(filePath, content = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

test('Python cache cleanup removes bytecode while preserving sources and dependency directories', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-python-cache-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    writeFile(path.join(root, 'scripts', '__pycache__', 'helper.cpython-313.pyc'), 'cache');
    writeFile(path.join(root, 'test', 'loose.pyc'), 'cache');
    writeFile(path.join(root, 'test', 'legacy.pyo'), 'cache');
    writeFile(path.join(root, 'test', 'keep.py'), 'print("keep")');
    writeFile(path.join(root, 'node_modules', 'package', '__pycache__', 'dependency.pyc'), 'keep');
    writeFile(path.join(root, '.venv', 'lib', '__pycache__', 'dependency.pyc'), 'keep');

    const result = cleanupPythonCache({ rootDirectory: root });

    assert.equal(result.removedDirectories, 1);
    assert.equal(result.removedFiles, 2);
    assert.equal(fs.existsSync(path.join(root, 'scripts', '__pycache__')), false);
    assert.equal(fs.existsSync(path.join(root, 'test', 'loose.pyc')), false);
    assert.equal(fs.existsSync(path.join(root, 'test', 'legacy.pyo')), false);
    assert.equal(fs.existsSync(path.join(root, 'test', 'keep.py')), true);
    assert.equal(fs.existsSync(path.join(root, 'node_modules', 'package', '__pycache__', 'dependency.pyc')), true);
    assert.equal(fs.existsSync(path.join(root, '.venv', 'lib', '__pycache__', 'dependency.pyc')), true);
    assert.equal(formatCleanupResult(result), '1 director __pycache__ și 2 fișiere .pyc/.pyo șterse');
});

test('Python cache cleanup succeeds when there is nothing to remove', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-python-cache-empty-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    writeFile(path.join(root, 'scripts', 'helper.py'), 'print("clean")');

    const result = cleanupPythonCache({ rootDirectory: root });

    assert.equal(result.removedDirectories, 0);
    assert.equal(result.removedFiles, 0);
});
