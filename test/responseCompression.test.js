const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const zlib = require('node:zlib');
const express = require('express');

const {
    DEFAULT_COMPRESSION_THRESHOLD_BYTES,
    createResponseCompressionMiddleware
} = require('../server/middleware/responseCompression');

function request(server, requestPath) {
    const { port } = server.address();

    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port,
            path: requestPath,
            headers: { 'Accept-Encoding': 'gzip' }
        }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({
                headers: response.headers,
                body: Buffer.concat(chunks)
            }));
        });
        req.on('error', reject);
    });
}

test('response compression gzips large text and skips payloads below the threshold', async t => {
    const app = express();
    app.use(createResponseCompressionMiddleware());
    app.get('/large', (req, res) => res.type('text/plain').send('F1'.repeat(4096)));
    app.get('/small', (req, res) => res.type('text/plain').send('F1'));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));

    const largeResponse = await request(server, '/large');
    const smallResponse = await request(server, '/small');

    assert.equal(DEFAULT_COMPRESSION_THRESHOLD_BYTES, 1024);
    assert.equal(largeResponse.headers['content-encoding'], 'gzip');
    assert.match(largeResponse.headers.vary, /Accept-Encoding/i);
    assert.equal(zlib.gunzipSync(largeResponse.body).toString('utf8'), 'F1'.repeat(4096));
    assert.equal(smallResponse.headers['content-encoding'], undefined);
});
