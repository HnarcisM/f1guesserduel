'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresAdminRepository } = require('../server/admin/adminRepository');

function createFakeDatabase() {
    const calls = [];
    return {
        provider: 'postgres',
        calls,
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 0 }] };
            if (sql.includes('FROM users')) return { rows: [] };
            if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [{ id: 1 }] };
            return { rows: [] };
        }
    };
}

test('Postgres admin user search remains parameterized for hostile input', async () => {
    const database = createFakeDatabase();
    const repository = createPostgresAdminRepository(database);
    const hostileSearch = "x%' OR 1=1 --";

    await repository.listUsers({ search: hostileSearch, limit: 25, offset: 0 });

    assert.equal(database.calls.some(call => call.sql.includes(hostileSearch)), false);
    assert.equal(database.calls.some(call => call.params.includes(`%${hostileSearch}%`)), true);
});

test('Postgres admin audit stores details as a JSON parameter instead of SQL text', async () => {
    const database = createFakeDatabase();
    const repository = createPostgresAdminRepository(database);
    const details = { reason: "room's state", count: 2 };

    const id = await repository.recordAudit({
        adminUserId: 1,
        action: 'room.closed',
        targetType: 'room',
        targetId: 'ABC123',
        details,
        requestId: 'req-1'
    });

    assert.equal(id, 1);
    const call = database.calls.at(-1);
    assert.equal(call.sql.includes(details.reason), false);
    assert.equal(call.params[4], JSON.stringify(details));
});
