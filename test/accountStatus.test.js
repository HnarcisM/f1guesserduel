'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAccountSuspended, buildSuspensionMessage } = require('../server/auth/accountStatus');

test('account status distinguishes active, expired, temporary and permanent suspensions', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    assert.equal(isAccountSuspended({ accountStatus: 'active' }, now), false);
    assert.equal(isAccountSuspended({ accountStatus: 'suspended', suspendedUntil: '2026-07-25T11:00:00Z' }, now), false);
    assert.equal(isAccountSuspended({ accountStatus: 'suspended', suspendedUntil: '2026-07-25T13:00:00Z' }, now), true);
    assert.equal(isAccountSuspended({ accountStatus: 'suspended', suspendedUntil: null }, now), true);
    assert.match(buildSuspensionMessage({ accountStatus: 'suspended', suspendedUntil: null }), /Contactează administratorul/);
});
