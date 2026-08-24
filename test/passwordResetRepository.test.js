'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createPostgresPasswordResetRepository
} = require('../server/auth/passwordResetRepository');

function createFakePostgresDatabase({ tokenUserId = 7, passwordRowCount = 1, sessionRowCount = 2 } = {}) {
    const databaseQueries = [];
    const transactionQueries = [];
    let releaseCalls = 0;

    const client = {
        async query(sql, params = []) {
            const normalized = sql.trim();
            transactionQueries.push({ sql: normalized, params });

            if (normalized.startsWith('UPDATE password_reset_tokens')) {
                return tokenUserId
                    ? { rows: [{ userId: tokenUserId }], rowCount: 1 }
                    : { rows: [], rowCount: 0 };
            }
            if (normalized.startsWith('UPDATE users')) {
                return { rows: [], rowCount: passwordRowCount };
            }
            if (normalized.startsWith('DELETE FROM sessions')) {
                return { rows: [], rowCount: sessionRowCount };
            }
            return { rows: [], rowCount: 0 };
        },
        release() {
            releaseCalls += 1;
        }
    };

    return {
        databaseQueries,
        transactionQueries,
        get releaseCalls() { return releaseCalls; },
        pool: {
            async connect() {
                return client;
            }
        },
        async query(sql, params = []) {
            const normalized = sql.trim();
            databaseQueries.push({ sql: normalized, params });
            if (normalized.startsWith('INSERT INTO password_reset_tokens')) {
                return { rows: [{ userId: 7 }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        }
    };
}

test('postgres reset token issuance is parameterized and replaces the previous token per user', async () => {
    const database = createFakePostgresDatabase();
    const repository = createPostgresPasswordResetRepository(database);

    const result = await repository.replaceTokenForEmail({
        email: 'narcis@example.com',
        tokenHash: 'a'.repeat(64),
        expiresAt: '2026-08-24T18:30:00.000Z'
    });

    assert.deepEqual(result, { userId: 7, sessionsRevoked: 0 });
    assert.equal(database.databaseQueries.length, 1);
    const query = database.databaseQueries[0];
    assert.deepEqual(query.params, [
        'narcis@example.com',
        'a'.repeat(64),
        '2026-08-24T18:30:00.000Z'
    ]);
    assert.match(query.sql, /WHERE lower\(users\.email\) = lower\(\$1\)/);
    assert.match(query.sql, /ON CONFLICT \(user_id\) DO UPDATE/);
    assert.match(query.sql, /token_hash = EXCLUDED\.token_hash/);
    assert.doesNotMatch(query.sql, /narcis@example\.com/);
});

test('postgres password reset consumes the token, changes password and revokes sessions in one transaction', async () => {
    const database = createFakePostgresDatabase({ sessionRowCount: 4 });
    const repository = createPostgresPasswordResetRepository(database);

    const result = await repository.consumeTokenAndResetPassword({
        tokenHash: 'b'.repeat(64),
        passwordHash: 'pbkdf2$220000$hash'
    });

    assert.deepEqual(result, { userId: 7, sessionsRevoked: 4 });
    assert.equal(database.releaseCalls, 1);
    assert.equal(database.transactionQueries[0].sql, 'BEGIN');
    assert.match(database.transactionQueries[1].sql, /UPDATE password_reset_tokens/);
    assert.match(database.transactionQueries[1].sql, /consumed_at IS NULL/);
    assert.match(database.transactionQueries[1].sql, /expires_at > now\(\)/);
    assert.deepEqual(database.transactionQueries[1].params, ['b'.repeat(64)]);
    assert.match(database.transactionQueries[2].sql, /UPDATE users/);
    assert.deepEqual(database.transactionQueries[2].params, [7, 'pbkdf2$220000$hash']);
    assert.match(database.transactionQueries[3].sql, /DELETE FROM sessions/);
    assert.deepEqual(database.transactionQueries[3].params, [7]);
    assert.equal(database.transactionQueries[4].sql, 'COMMIT');
});

test('postgres reset tokens are one-time and an invalid token cannot update credentials', async () => {
    const database = createFakePostgresDatabase({ tokenUserId: null });
    const repository = createPostgresPasswordResetRepository(database);

    const result = await repository.consumeTokenAndResetPassword({
        tokenHash: 'c'.repeat(64),
        passwordHash: 'pbkdf2$220000$hash'
    });

    assert.equal(result, null);
    assert.deepEqual(database.transactionQueries.map(query => query.sql), [
        'BEGIN',
        database.transactionQueries[1].sql,
        'COMMIT'
    ]);
    assert.match(database.transactionQueries[1].sql, /UPDATE password_reset_tokens/);
    assert.equal(database.releaseCalls, 1);
});

test('postgres reset transaction rolls back if the password update cannot be completed', async () => {
    const database = createFakePostgresDatabase({ passwordRowCount: 0 });
    const repository = createPostgresPasswordResetRepository(database);

    await assert.rejects(
        repository.consumeTokenAndResetPassword({
            tokenHash: 'd'.repeat(64),
            passwordHash: 'pbkdf2$220000$hash'
        }),
        /could not update the target account/
    );

    assert.equal(database.transactionQueries.at(-1).sql, 'ROLLBACK');
    assert.equal(
        database.transactionQueries.some(query => query.sql.startsWith('DELETE FROM sessions')),
        false
    );
    assert.equal(database.releaseCalls, 1);
});
