'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresAdminOperationalRepository } = require('../server/admin/adminOperationalRepository');


test('admin operational repository aggregates modes and records suspension history with parameters', async () => {
    const queries = [];
    const database = {
        async query(sql, params = []) {
            queries.push({ sql: sql.trim(), params });
            if (sql.includes('FROM user_game_results')) return { rows: [{ mode: 'single', difficulty: 'easy', gamesPlayed: 3 }] };
            if (sql.includes('FROM user_suspension_history')) return { rows: [{ details: { revokedSessions: 2 } }] };
            if (sql.includes('INSERT INTO user_suspension_history')) return { rows: [{ id: '9' }] };
            return { rows: [] };
        }
    };
    const repository = createPostgresAdminOperationalRepository(database);
    assert.equal((await repository.getModeDifficultyStats())[0].mode, 'single');
    assert.equal((await repository.getSuspensionHistory(7))[0].details.revokedSessions, 2);
    assert.equal(await repository.recordSuspensionHistory({
        userId: 7,
        adminUserId: 1,
        eventType: 'suspended',
        duration: '24h',
        reason: 'Test',
        suspendedUntil: '2026-07-27T00:00:00.000Z'
    }), 9);
    const insert = queries.find(query => query.sql.startsWith('INSERT INTO user_suspension_history'));
    assert.deepEqual(insert.params.slice(0, 6), [7, 1, 'suspended', '24h', 'Test', '2026-07-27T00:00:00.000Z']);
});
