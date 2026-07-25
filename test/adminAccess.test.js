'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createAdminAccess,
    normalizeAdminAccountUuids,
    normalizeAdminUserIds
} = require('../server/admin/adminAccess');

const OWNER_UUID = '11111111-2222-4333-8444-555555555555';

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        type() { return this; },
        send(body) { this.body = body; return this; }
    };
}

test('admin access prefers immutable account UUIDs over numeric ids', () => {
    assert.deepEqual([...normalizeAdminAccountUuids([OWNER_UUID.toUpperCase(), OWNER_UUID, 'invalid'])], [OWNER_UUID]);
    assert.deepEqual([...normalizeAdminUserIds([1, '2', 2, 0, -1, 'invalid'])], [1, 2]);

    const access = createAdminAccess({ accountUuids: [OWNER_UUID], legacyUserIds: [7] });
    assert.equal(access.enabled, true);
    assert.equal(access.mode, 'account-uuid');
    assert.equal(access.usesLegacyUserIds, false);
    assert.equal(access.isAdminUser({ id: 99, accountUuid: OWNER_UUID }), true);
    assert.equal(access.isAdminUser({ id: 7, accountUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }), false);
});

test('numeric admin ids remain a migration-only fallback', () => {
    const access = createAdminAccess({ legacyUserIds: [7] });
    assert.equal(access.mode, 'legacy-user-id');
    assert.equal(access.usesLegacyUserIds, true);
    assert.equal(access.isAdminUser({ id: 7 }), true);
    assert.equal(access.isAdminUser({ id: 8 }), false);
});

test('admin API distinguishes unauthenticated and unauthorized users', () => {
    const access = createAdminAccess({ accountUuids: [OWNER_UUID] });

    const anonymousResponse = createResponse();
    access.requireAdminApi({ user: null }, anonymousResponse, () => assert.fail('next must not run'));
    assert.equal(anonymousResponse.statusCode, 401);

    const userResponse = createResponse();
    access.requireAdminApi({ user: { accountUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }, userResponse, () => assert.fail('next must not run'));
    assert.equal(userResponse.statusCode, 403);

    const adminResponse = createResponse();
    let nextCalled = false;
    access.requireAdminApi({ user: { accountUuid: OWNER_UUID } }, adminResponse, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(adminResponse.headers['Cache-Control'], 'no-store');
});

test('admin page conceals itself from unauthorized users', () => {
    const access = createAdminAccess({ accountUuids: [OWNER_UUID] });
    const response = createResponse();
    access.requireAdminPage({ user: { accountUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }, response, () => assert.fail('next must not run'));
    assert.equal(response.statusCode, 404);
    assert.equal(response.body, 'Not found');
});
