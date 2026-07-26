'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminLoginNotifier, normalizeWebhookUrl } = require('../server/admin/adminLoginNotifier');


test('admin login notifier ignores normal users and audits administrator logins', async () => {
    const audits = [];
    const requests = [];
    const notifier = createAdminLoginNotifier({
        isAdminUser: user => user?.id === 1,
        recordAuditEvent: async entry => audits.push(entry),
        webhookUrl: 'https://hooks.example.test/admin',
        fetchFn: async (url, options) => {
            requests.push({ url, payload: JSON.parse(options.body) });
            return { ok: true, status: 204 };
        },
        logger: { warn() {}, error() {} },
        clock: () => new Date('2026-07-26T11:00:00.000Z')
    });

    assert.equal((await notifier.notify({ user: { id: 2 } })).reason, 'not-admin');
    const result = await notifier.notify({
        user: { id: 1, accountUuid: '11111111-2222-4333-8444-555555555555', username: 'Narcis' },
        request: { ip: '203.0.113.7', requestId: 'req-1', get: () => 'Test Browser' },
        authorizationMode: 'account-uuid'
    });
    assert.equal(result.webhook.sent, true);
    assert.equal(audits[0].action, 'admin.login.succeeded');
    assert.equal(audits[0].details.ip, '203.0.113.7');
    assert.equal(requests[0].payload.admin.username, 'Narcis');
});


test('admin login webhook accepts only http and https URLs', () => {
    assert.equal(normalizeWebhookUrl('https://example.test/hook'), 'https://example.test/hook');
    assert.equal(normalizeWebhookUrl('file:///tmp/hook'), null);
    assert.equal(normalizeWebhookUrl('invalid'), null);
});

test('admin login webhook still runs when audit persistence fails', async () => {
    const logs = [];
    let webhookCalls = 0;
    const notifier = createAdminLoginNotifier({
        isAdminUser: user => user?.id === 1,
        recordAuditEvent: async () => { throw new Error('database unavailable'); },
        webhookUrl: 'https://hooks.example.test/admin',
        fetchFn: async () => {
            webhookCalls += 1;
            return { ok: true, status: 204 };
        },
        logger: {
            warn() {},
            error(message) { logs.push(message); }
        }
    });

    const result = await notifier.notify({ user: { id: 1, username: 'Narcis' } });
    assert.equal(result.notified, true);
    assert.equal(result.audit.recorded, false);
    assert.equal(result.webhook.sent, true);
    assert.equal(webhookCalls, 1);
    assert.deepEqual(logs, ['Admin login audit failed.']);
});
