const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const {
    createPostgresAccountStatsRepository,
    createSqliteAccountStatsRepository
} = require('../server/account/accountStatsRepository');

class FakePostgresClient {
    constructor() {
        this.queries = [];
        this.resultKeys = new Set();
        this.dailyAttemptKeys = new Set();
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
        if (normalizedSql.startsWith('INSERT INTO user_daily_attempts')) {
            const key = `${params[0]}:${params[1]}`;
            if (this.dailyAttemptKeys.has(key)) return { rowCount: 0, rows: [] };
            this.dailyAttemptKeys.add(key);
            return { rowCount: 1, rows: [{ challenge_id: params[1] }] };
        }
        if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM user_daily_attempts')) {
            return {
                rows: [{
                    challengeId: 'f1-daily-v1:2026-07-23:easy',
                    difficulty: 'easy',
                    dailyDate: '2026-07-23'
                }]
            };
        }
        if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM user_game_results')) {
            return {
                rows: [{
                    mode: 'single',
                    outcome: 'win',
                    attempts: 2,
                    difficulty: 'easy',
                    targetDriverId: 'VER',
                    targetDriverName: 'Max Verstappen',
                    durationMs: 42000,
                    roomId: 'ABC',
                    matchId: 'ABC:123',
                    opponentUsername: 'Guest',
                    winnerUsername: 'Narcis',
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
        targetDriverId: 'VER',
        targetDriverName: 'Max Verstappen',
        durationMs: 42000,
        roomId: 'ABC',
        matchId: 'ABC:123',
        opponentUsername: 'Guest',
        winnerUsername: 'Narcis',
        xpEarned: 50
    };

    const first = await repository.recordGameResult(input);
    const duplicate = await repository.recordGameResult(input);
    const resultInsert = client.queries.find(query => query.sql.startsWith('INSERT INTO user_game_results'));
    const statsUpserts = client.queries.filter(query => query.sql.startsWith('INSERT INTO user_game_stats'));
    const progressUpserts = client.queries.filter(query => query.sql.startsWith('INSERT INTO user_progress'));
    const accountLocks = client.queries.filter(query => query.sql.startsWith('SELECT pg_advisory_xact_lock'));
    const historyQueries = client.queries.filter(query => query.sql.includes('FROM user_game_results'));

    assert.equal(first.recorded, true);
    assert.equal(duplicate.recorded, false);
    assert.equal(resultInsert.params[2], input.resultKey);
    assert.equal(resultInsert.sql.includes(input.resultKey), false);
    assert.deepEqual(resultInsert.params.slice(6), [
        'VER',
        'Max Verstappen',
        42000,
        'ABC',
        'ABC:123',
        'Guest',
        'Narcis'
    ]);
    assert.equal(statsUpserts.length, 1);
    assert.equal(progressUpserts.length, 1);
    assert.deepEqual(progressUpserts[0].params, [7, 50]);
    assert.equal(accountLocks.length, 2);
    assert.deepEqual(accountLocks[0].params, [7]);
    assert.ok(Array.isArray(first.previousRows));
    assert.equal(first.progressRow.total_xp, 50);
    assert.equal(first.recentResults.length, 1);
    assert.equal(historyQueries.length, 2);
    assert.deepEqual(historyQueries[0].params, [7, 10]);
    assert.match(statsUpserts[0].sql, /ON CONFLICT \(user_id, mode\) DO UPDATE/);
    assert.equal(client.queries.filter(query => query.sql === 'BEGIN').length, 2);
    assert.equal(client.queries.filter(query => query.sql === 'COMMIT').length, 2);
    assert.equal(client.releaseCalls, 2);
});

test('Postgres Daily claims use parameterized ON CONFLICT protection', async () => {
    const client = new FakePostgresClient();
    const repository = createPostgresAccountStatsRepository({
        pool: { async connect() { return client; } },
        query: (...args) => client.query(...args)
    });
    const attempt = {
        userId: 7,
        challengeId: 'f1-daily-v1:2026-07-23:easy',
        dailyDate: '2026-07-23',
        difficulty: 'easy'
    };

    assert.equal(await repository.claimDailyAttempt(attempt), true);
    assert.equal(await repository.claimDailyAttempt(attempt), false);
    assert.deepEqual(await repository.getDailyAttempts(7, '2026-07-23'), [{
        challengeId: attempt.challengeId,
        difficulty: 'easy',
        dailyDate: '2026-07-23'
    }]);

    const claimQuery = client.queries.find(query => query.sql.startsWith('INSERT INTO user_daily_attempts'));
    const selectQuery = client.queries.find(query => query.sql.includes('FROM user_daily_attempts'));
    assert.match(claimQuery.sql, /ON CONFLICT \(user_id, challenge_id\) DO NOTHING/);
    assert.deepEqual(claimQuery.params, [7, attempt.challengeId, '2026-07-23', 'easy']);
    assert.match(selectQuery.sql, /to_char\(daily_date, 'YYYY-MM-DD'\) AS "dailyDate"/);
    assert.deepEqual(selectQuery.params, [7, '2026-07-23']);
});

test('SQLite captures the exact pre-round progress inside the result transaction', async t => {
    let database;
    try {
        database = new Database(':memory:');
    } catch (error) {
        if (error?.code === 'ERR_DLOPEN_FAILED') {
            t.skip('better-sqlite3 is not compiled for the local Node.js runtime');
            return;
        }
        throw error;
    }
    t.after(() => database.close());
    database.exec(fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8'));
    database.prepare(`
        INSERT INTO users (username, email, password_hash)
        VALUES ('Narcis', 'narcis@example.com', 'hash')
    `).run();
    const repository = createSqliteAccountStatsRepository(database);
    const baseResult = {
        userId: 1,
        mode: 'single',
        outcome: 'win',
        attempts: 2,
        difficulty: 'easy',
        targetDriverId: 'VER',
        targetDriverName: 'Max Verstappen',
        durationMs: 42000,
        matchId: 'single:round',
        winnerUsername: 'Narcis',
        xpEarned: 50
    };

    const first = await repository.recordGameResult({ ...baseResult, resultKey: 'round-1' });
    const second = await repository.recordGameResult({ ...baseResult, resultKey: 'round-2' });
    const duplicate = await repository.recordGameResult({ ...baseResult, resultKey: 'round-2' });

    assert.deepEqual(first.previousRows, []);
    assert.equal(first.previousProgressRow, null);
    assert.equal(second.previousRows[0].games_played, 1);
    assert.equal(second.previousProgressRow.total_xp, 50);
    assert.equal(second.progressRow.total_xp, 100);
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.previousRows, null);
    assert.equal(duplicate.progressRow.total_xp, 100);
    assert.equal(second.recentResults[0].targetDriverName, 'Max Verstappen');
    assert.equal(second.recentResults[0].durationMs, 42000);
    assert.equal(second.recentResults[0].winnerUsername, 'Narcis');
});
