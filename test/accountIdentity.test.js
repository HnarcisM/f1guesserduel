'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ACCOUNT_UUID_PATTERN,
    generateAccountUuid,
    normalizeAccountUuid
} = require('../server/auth/accountIdentity');

test('account UUID normalization accepts canonical identities only', () => {
    const value = '11111111-2222-4333-8444-555555555555';
    assert.equal(normalizeAccountUuid(` ${value.toUpperCase()} `), value);
    assert.equal(normalizeAccountUuid('1'), null);
    assert.equal(normalizeAccountUuid('not-a-uuid'), null);
});

test('generated account identities are random canonical UUIDs', () => {
    const first = generateAccountUuid();
    const second = generateAccountUuid();
    assert.match(first, ACCOUNT_UUID_PATTERN);
    assert.match(second, ACCOUNT_UUID_PATTERN);
    assert.notEqual(first, second);
});
