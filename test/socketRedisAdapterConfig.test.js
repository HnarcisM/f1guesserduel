const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('multi-instance Socket.IO support is installed but disabled by default', () => {
    const packageJson = JSON.parse(read('package.json'));
    const packageLock = JSON.parse(read('package-lock.json'));
    const envExample = read('.env.example');
    const renderConfig = read('render.yaml');

    assert.equal(packageJson.dependencies['@socket.io/redis-adapter'], '8.3.0');
    assert.equal(
        packageLock.packages['node_modules/@socket.io/redis-adapter']?.version,
        '8.3.0'
    );
    assert.match(envExample, /SOCKET_REDIS_ADAPTER_ENABLED=false/);
    assert.match(renderConfig, /key: SOCKET_REDIS_ADAPTER_ENABLED\s+value: false/);
});

test('multi-instance runbook documents Redis security, locks and sticky sessions', () => {
    const documentation = read('docs/socketio-multi-instance.md');
    const serverSource = read('server/index.js');
    const socketAuthSource = read('server/socket/socketAuth.js');

    assert.match(documentation, /sticky sessions/i);
    assert.match(documentation, /rediss:\/\//i);
    assert.match(documentation, /lock Redis per cameră/i);
    assert.match(documentation, /SOCKET_REDIS_ADAPTER_ENABLED=true/);
    assert.match(serverSource, /config\.socket\.redisAdapter\.enabled/);
    assert.match(serverSource, /createRedisSocketAdapter/);
    assert.match(socketAuthSource, /socket\.data\.authUser/);
});
