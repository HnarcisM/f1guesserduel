const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeClientAuthUser,
    normalizeDriverId,
    normalizeRoundOptions,
    normalizeRestartOptions
} = require('../server/socket/socketPayloadValidators');

test('normalizeDriverId accepts safe driver ids', () => {
    assert.equal(normalizeDriverId('hamilton_44'), 'hamilton_44');
    assert.equal(normalizeDriverId('max-verstappen'), 'max-verstappen');
});

test('normalizeDriverId rejects unsafe or empty values', () => {
    assert.equal(normalizeDriverId(''), null);
    assert.equal(normalizeDriverId('bad id with spaces'), null);
    assert.equal(normalizeDriverId('<script>'), null);
});

test('normalizeRoundOptions accepts valid difficulty payload', () => {
    assert.deepEqual(normalizeRoundOptions({ level: 'easy', timed: true, timeLimitSeconds: 90 }), {
        difficulty: 'easy',
        timed: true,
        timeLimitSeconds: 90
    });
});

test('normalizeRoundOptions rejects invalid difficulty', () => {
    assert.equal(normalizeRoundOptions({ level: 'impossible', timed: true, timeLimitSeconds: 90 }), null);
});

test('normalizeRestartOptions falls back to safe timer values', () => {
    assert.deepEqual(normalizeRestartOptions({ timed: true, timeLimitSeconds: 999 }), {
        timed: true,
        timeLimitSeconds: 60
    });
});

test('normalizeClientAuthUser sanitizes basic user data', () => {
    assert.deepEqual(normalizeClientAuthUser({ id: 123, username: ' Narcis ', email: ' test@example.com ' }), {
        id: '123',
        username: 'Narcis',
        email: 'test@example.com'
    });
});

test('normalizeClientAuthUser rejects invalid username', () => {
    assert.equal(normalizeClientAuthUser({ id: 123, username: '   ' }), null);
});
