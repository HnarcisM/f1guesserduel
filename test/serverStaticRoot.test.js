const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverSource = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'index.js'),
    'utf8'
);

test('production server serves the root document through the static middleware only', () => {
    assert.match(
        serverSource,
        /app\.use\(express\.static\(config\.publicDir,\s*\{[\s\S]*?setHeaders:\s*setStaticCacheHeaders[\s\S]*?\}\)\);/
    );
    assert.doesNotMatch(serverSource, /app\.get\(\s*['"]\/['"]/);
    assert.doesNotMatch(serverSource, /index\.txt/);
    assert.doesNotMatch(serverSource, /require\(['"]fs['"]\)/);
});
