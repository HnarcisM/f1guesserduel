'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getIsoWeekInfo,
    getNextWeeklyResetAt,
    getWeeklyChallengeId,
    normalizeWeeklyDifficulty
} = require('../server/game/weeklyChallenge');

test('Weekly challenge uses ISO weeks across year boundaries', () => {
    assert.deepEqual(getIsoWeekInfo('2026-01-01T12:00:00Z'), {
        year: 2026,
        week: 1,
        key: '2026-W01'
    });
    assert.equal(getIsoWeekInfo('2027-01-01T12:00:00Z').key, '2026-W53');
});

test('Weekly reset is the next Monday at 00:00 UTC', () => {
    assert.equal(
        getNextWeeklyResetAt('2026-07-25T12:00:00Z'),
        '2026-07-27T00:00:00.000Z'
    );
    assert.equal(
        getNextWeeklyResetAt('2026-07-27T00:00:00Z'),
        '2026-08-03T00:00:00.000Z'
    );
});

test('Weekly challenge identifiers include version, week and difficulty', () => {
    const date = '2026-07-25T12:00:00Z';
    assert.equal(getWeeklyChallengeId('easy', date), 'f1-weekly-v2:2026-W30:easy');
    assert.equal(getWeeklyChallengeId('hard', date), 'f1-weekly-v2:2026-W30:hard');
    assert.equal(getWeeklyChallengeId('all', date), null);
    assert.equal(normalizeWeeklyDifficulty(' MEDIUM '), 'medium');
});
