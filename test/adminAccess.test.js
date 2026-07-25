'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminAccess, normalizeAdminUserIds } = require('../server/admin/adminAccess');

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

test('admin access accepts only configured positive user ids', () => {
    assert.deepEqual([...normalizeAdminUserIds([1, '2', 2, 0, -1, 'invalid'])], [1, 2]);
    const access = createAdminAccess({ userIds: [7] });
    assert.equal(access.enabled, true);
    assert.equal(access.isAdminUser({ id: 7 }), true);
    assert.equal(access.isAdminUser({ id: 8 }), false);
});

test('admin API distinguishes unauthenticated and unauthorized users', () => {
    const access = createAdminAccess({ userIds: [7] });

    const anonymousResponse = createResponse();
    access.requireAdminApi({ user: null }, anonymousResponse, () => assert.fail('next must not run'));
    assert.equal(anonymousResponse.statusCode, 401);

    const userResponse = createResponse();
    access.requireAdminApi({ user: { id: 8 } }, userResponse, () => assert.fail('next must not run'));
    assert.equal(userResponse.statusCode, 403);

    const adminResponse = createResponse();
    let nextCalled = false;
    access.requireAdminApi({ user: { id: 7 } }, adminResponse, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(adminResponse.headers['Cache-Control'], 'no-store');
});

test('admin page conceals itself from unauthorized users', () => {
    const access = createAdminAccess({ userIds: [7] });
    const response = createResponse();
    access.requireAdminPage({ user: { id: 8 } }, response, () => assert.fail('next must not run'));
    assert.equal(response.statusCode, 404);
    assert.equal(response.body, 'Not found');
});
