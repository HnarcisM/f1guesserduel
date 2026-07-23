const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const {
    createApiRequestContextMiddleware
} = require('../server/middleware/apiRequestContext');

test('static assets and unrelated API routes skip session lookups', async () => {
    let sessionLookups = 0;
    const sessionService = {
        cookieName: 'f1_session',
        async getAuthContextByToken(token) {
            sessionLookups += 1;
            return token === 'valid-session'
                ? {
                    user: { id: 7, username: 'Static_Test' },
                    socketAuthToken: 'verified-socket-token'
                }
                : null;
        }
    };
    const app = express();

    app.use(
        ['/api/auth', '/api/account'],
        createApiRequestContextMiddleware(sessionService)
    );
    app.get('/api/auth/probe', (req, res) => {
        res.json({ user: req.user, socketAuthToken: req.authContext?.socketAuthToken });
    });
    app.post('/api/account/probe', (req, res) => {
        res.json({ user: req.user, body: req.body });
    });
    app.get('/api/health/probe', (req, res) => {
        res.json({ ok: true });
    });
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { Cookie: 'f1_session=valid-session' };

    try {
        const staticResponse = await fetch(`${baseUrl}/game.bundle.min.js`, { headers });
        assert.equal(staticResponse.status, 200);
        assert.equal(sessionLookups, 0);

        const healthResponse = await fetch(`${baseUrl}/api/health/probe`, { headers });
        assert.equal(healthResponse.status, 200);
        assert.equal(sessionLookups, 0);

        const authResponse = await fetch(`${baseUrl}/api/auth/probe`, { headers });
        assert.equal(authResponse.status, 200);
        assert.deepEqual(await authResponse.json(), {
            user: { id: 7, username: 'Static_Test' },
            socketAuthToken: 'verified-socket-token'
        });
        assert.equal(sessionLookups, 1);

        const accountResponse = await fetch(`${baseUrl}/api/account/probe`, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ avatarKey: 'helmet-red' })
        });
        assert.equal(accountResponse.status, 200);
        assert.deepEqual(await accountResponse.json(), {
            user: { id: 7, username: 'Static_Test' },
            body: { avatarKey: 'helmet-red' }
        });
        assert.equal(sessionLookups, 2);
    } finally {
        server.close();
        await once(server, 'close');
    }
});
