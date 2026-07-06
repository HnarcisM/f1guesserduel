const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('Render blueprint documents production web service settings', () => {
    const source = readProjectFile('render.yaml');

    assert.match(source, /type:\s*web/);
    assert.match(source, /runtime:\s*node/);
    assert.match(source, /plan:\s*free/);
    assert.match(source, /buildCommand:\s*npm ci && npm run build:css/);
    assert.match(source, /startCommand:\s*npm start/);
    assert.match(source, /healthCheckPath:\s*\/api\/health/);
    assert.match(source, /key:\s*PERSISTENCE_MODE\s+value:\s*ephemeral/s);
});

test('Render blueprint keeps production secrets out of Git', () => {
    const source = readProjectFile('render.yaml');

    assert.match(source, /key:\s*SESSION_SECRET\s+sync:\s*false/s);
    assert.match(source, /key:\s*SOCKET_AUTH_SECRET\s+sync:\s*false/s);
    assert.match(source, /key:\s*PUBLIC_ORIGIN\s+sync:\s*false/s);
    assert.doesNotMatch(source, /change-me-to-a-long-random-secret/);
    assert.doesNotMatch(source, /change-me-to-another-long-random-secret/);
});

test('example environment uses Render-safe production defaults', () => {
    const source = readProjectFile('.env.example');

    assert.match(source, /NODE_ENV=production/);
    assert.match(source, /DATA_DIR=\/tmp\/f1guesserduel/);
    assert.match(source, /PERSISTENCE_MODE=ephemeral/);
    assert.match(source, /ROOMS_FILE_PATH=\/tmp\/f1guesserduel\/rooms\.json/);
    assert.match(source, /COOKIE_SECURE=true/);
    assert.match(source, /COOKIE_SAMESITE=lax/);
    assert.match(source, /TRUST_PROXY=true/);
    assert.match(source, /PUBLIC_ORIGIN=https:\/\/f1guesserduel\.onrender\.com/);
    assert.doesNotMatch(source, /^PORT=/m);
});

test('deployment guide includes manual Render checks and secret generation', () => {
    const source = readProjectFile('DEPLOYMENT.md');

    assert.match(source, /Build Command: npm ci && npm run build:css/);
    assert.match(source, /Start Command: npm start/);
    assert.match(source, /Health Check Path: \/api\/health/);
    assert.match(source, /randomBytes\(32\)\.toString\('hex'\)/);
    assert.match(source, /Nu seta manual `PORT`/);
    assert.match(source, /PUBLIC_ORIGIN=https:\/\/numele-serviciului-tau\.onrender\.com/);
    assert.match(source, /SOCKET_ALLOWED_ORIGINS/);
    assert.match(source, /PERSISTENCE_MODE=ephemeral/);
    assert.match(source, /\/api\/health.*persistence/s);
});
