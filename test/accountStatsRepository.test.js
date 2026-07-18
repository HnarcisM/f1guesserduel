const assert = require('node:assert/strict');
const test = require('node:test');

const { createPostgresAccountStatsRepository } = require('../server/account/accountStatsRepository');

class FakePostgresClient {
    constructor() {
        this.queries = [];
        this.resultKeys = new Set();
        this.releaseCalls = 0;
    }

    async query(sql, params = []) {
        const normalizedSql = sql.trim();
        this.queries.push({ sql: normalizedSql, params });

        if (normalizedSql.startsWith('INSERT INTO user_game_results')) {
            const key = `${params[0]}:${params[1]}:${params[2]}`;
            if (this.resultKeys.has(key)) return { rowCount: 0, rows: [] };
            this.resultKeys.add(key);
            return { rowCount: 1, rows: [{ id: 1 }] };
        }
        if (normalizedSql.startsWith('SELECT mode, outcome')) {
            return {
                rows: [{
                    mode: 'single',
                    outcome: 'win',
                    attempts: 2,
                    difficulty: 'easy',
                    completedAt: '2026-07-18T12:00:00.000Z'
                }]
            };
        }
        if (normalizedSql.startsWith('SELECT mode')) {
            return {
                rows: [{
                    mode: 'single',
                    games_played: 1,
                    games_won: 1,
                    games_drawn: 0,
                    current_streak: 1,
                    best_streak: 1,
                    guess_1: 0,
                    guess_2: 1,
                    guess_3: 0,
                    guess_4: 0,
                    guess_5: 0,
                    guess_6: 0
                }]
            };
        }
        if (normalizedSql.startsWith('SELECT total_xp')) {
            return { rows: [{ total_xp: 50 }] };
        }
        return { rowCount: 0, rows: [] };
    }

    release() {
        this.releaseCalls += 1;
    }
}

test('Postgres account stats use a transaction, parameters and idempotent result keys', async () => {
    const client = new FakePostgresClient();
    const repository = createPostgresAccountStatsRepository({
        pool: { async connect() { return client; } },
        query: (...args) => client.query(...args)
    });
    const input = {
        userId: 7,
        mode: 'single',
        resultKey: "round-1'); DROP TABLE users; --",
        outcome: 'win',
        attempts: 2,
        difficulty: 'easy',
        xpEarned: 50
    };

    const first = await repository.recordGameResult(input);
    const duplicate = await repository.recordGameResult(input);
    const resultInsert = client.queries.find(query => query.sql.startsWith('INSERT INTO user_game_results'));
    const statsUpserts = client.queries.filter(query => query.sql.startsWith('INSERT INTO user_game_stats'));
    const progressUpserts = client.queries.filter(query => query.sql.startsWith('INSERT INTO user_progress'));
    const historyQueries = client.queries.filter(query => query.sql.startsWith('SELECT mode, outcome'));

    assert.equal(first.recorded, true);
    assert.equal(duplicate.recorded, false);
    assert.equal(resultInsert.params[2], input.resultKey);
    assert.equal(resultInsert.sql.includes(input.resultKey), false);
    assert.equal(statsUpserts.length, 1);
    assert.equal(progressUpserts.length, 1);
    assert.deepEqual(progressUpserts[0].params, [7, 50]);
    assert.equal(first.progressRow.total_xp, 50);
    assert.equal(first.recentResults.length, 1);
    assert.equal(historyQueries.length, 2);
    assert.deepEqual(historyQueries[0].params, [7, 10]);
    assert.match(statsUpserts[0].sql, /ON CONFLICT \(user_id, mode\) DO UPDATE/);
    assert.equal(client.queries.filter(query => query.sql === 'BEGIN').length, 2);
    assert.equal(client.queries.filter(query => query.sql === 'COMMIT').length, 2);
    assert.equal(client.releaseCalls, 2);
});
