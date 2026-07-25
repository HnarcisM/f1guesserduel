'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createAdminRoutes } = require('../server/admin/adminRoutes');

function passThrough(req, res, next) { next(); }

async function withServer(options, action) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = options.user;
        req.requestId = 'req-admin-test';
        next();
    });
    app.use(createAdminRoutes({
        adminAccess: options.adminAccess,
        adminService: options.adminService,
        authService: options.authService,
        rateLimiters: { read: passThrough, write: passThrough }
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const address = server.address();
        return await action(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test('admin routes return overview only after server-side authorization', async () => {
    const adminService = {
        async getOverview() { return { totalUsers: 3 }; }
    };
    await withServer({
        user: { id: 1, username: 'Admin', email: 'admin@example.com' },
        adminAccess: { requireAdminApi: passThrough },
        adminService,
        authService: {}
    }, async baseUrl => {
        const response = await fetch(`${baseUrl}/overview`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { totalUsers: 3 });
    });
});

test('admin routes audit a failed password reconfirmation without executing the action', async () => {
    const audits = [];
    let revokeCalls = 0;
    const adminService = {
        async recordAuditEvent(entry) { audits.push(entry); },
        async revokeUserSessions() { revokeCalls += 1; return { ok: true, revokedSessions: 1 }; }
    };
    await withServer({
        user: { id: 1, username: 'Admin', email: 'admin@example.com' },
        adminAccess: { requireAdminApi: passThrough },
        adminService,
        authService: { async verifyPasswordForUser() { return false; } }
    }, async baseUrl => {
        const response = await fetch(`${baseUrl}/users/2/revoke-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: 'wrong' })
        });
        assert.equal(response.status, 401);
        assert.equal(revokeCalls, 0);
        assert.equal(audits.length, 1);
        assert.equal(audits[0].action, 'admin.reauthentication.failed');
        assert.equal(audits[0].details.method, 'POST');
    });
});

test('admin suspension route requires password and forwards validated moderation data', async () => {
    const calls = [];
    const adminService = {
        async suspendUser(payload) { calls.push(payload); return { ok: true, userId: 2 }; },
        async recordAuditEvent() {}
    };
    await withServer({
        user: { id: 1, username: 'Admin', email: 'admin@example.com' },
        adminAccess: { requireAdminApi: passThrough },
        adminService,
        authService: { async verifyPasswordForUser() { return true; } }
    }, async baseUrl => {
        const response = await fetch(`${baseUrl}/users/2/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: 'secret', duration: '24h', reason: 'Abuz repetat în camere' })
        });
        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].adminUserId, 1);
        assert.equal(calls[0].targetUserId, '2');
        assert.equal(calls[0].duration, '24h');
        assert.equal(calls[0].reason, 'Abuz repetat în camere');
    });
});

test('admin user details and filtered audit routes return service payloads', async () => {
    const adminService = {
        async getUserDetails() { return { ok: true, user: { id: 2 } }; },
        async listAudit(options) { return { entries: [], total: 0, options }; }
    };
    await withServer({
        user: { id: 1, username: 'Admin', email: 'admin@example.com' },
        adminAccess: { requireAdminApi: passThrough },
        adminService,
        authService: {}
    }, async baseUrl => {
        const details = await fetch(`${baseUrl}/users/2`);
        assert.equal(details.status, 200);
        assert.equal((await details.json()).user.id, 2);
        const audit = await fetch(`${baseUrl}/audit?action=user.&search=Pilot`);
        const payload = await audit.json();
        assert.equal(payload.options.action, 'user.');
        assert.equal(payload.options.search, 'Pilot');
    });
});
