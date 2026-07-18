const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createPostgresAuthRepository,
    isUniqueConstraintError
} = require('../server/auth/authRepository');

function createFakePostgresDatabase() {
    const queries = [];
    return {
        queries,
        async query(sql, params = []) {
            queries.push({ sql: sql.trim(), params });

            if (sql.includes('INSERT INTO users')) {
                return {
                    rows: [{
                        id: '7',
                        username: params[0],
                        email: params[1],
                        createdAt: '2026-07-07T00:00:00.000Z'
                    }],
                    rowCount: 1
                };
            }

            if (sql.includes('FROM users') && sql.includes('lower(email)')) {
                return {
                    rows: [{
                        id: '7',
                        username: 'Narcis',
                        email: params[0].toLowerCase(),
                        password_hash: 'hash',
                        createdAt: '2026-07-07T00:00:00.000Z'
                    }],
                    rowCount: 1
                };
            }

            if (sql.includes('FROM users') && sql.includes('password_hash') && sql.includes('WHERE id = $1')) {
                return {
                    rows: [{
                        id: '7',
                        username: 'Narcis',
                        email: 'narcis@example.com',
                        password_hash: 'hash',
                        createdAt: '2026-07-07T00:00:00.000Z'
                    }],
                    rowCount: 1
                };
            }

            if (sql.includes('UPDATE users') && sql.includes('SET username')) {
                return {
                    rows: [{
                        id: '7',
                        username: params[1],
                        email: 'narcis@example.com',
                        createdAt: '2026-07-07T00:00:00.000Z'
                    }],
                    rowCount: 1
                };
            }

            if (sql.includes('FROM sessions') && sql.includes('JOIN users')) {
                return {
                    rows: [{
                        id: '7',
                        username: 'Narcis',
                        email: 'narcis@example.com',
                        createdAt: '2026-07-07T00:00:00.000Z'
                    }],
                    rowCount: 1
                };
            }

            return { rows: [], rowCount: 0 };
        }
    };
}

test('postgres auth repository uses parameterized user inserts and normalizes ids', async () => {
    const database = createFakePostgresDatabase();
    const repository = createPostgresAuthRepository(database);

    const user = await repository.createUser({
        username: 'Narcis',
        email: 'narcis@example.com',
        passwordHash: 'pbkdf2$hash'
    });

    assert.equal(user.id, 7);
    assert.equal(user.username, 'Narcis');
    assert.equal(database.queries[0].params[0], 'Narcis');
    assert.equal(database.queries[0].params[2], 'pbkdf2$hash');
    assert.match(database.queries[0].sql, /RETURNING id, username, email/);
});

test('postgres auth repository finds sessions using database time and token hash parameter', async () => {
    const database = createFakePostgresDatabase();
    const repository = createPostgresAuthRepository(database);

    const user = await repository.getSessionUserByHash('hashed-token');

    assert.equal(user.username, 'Narcis');
    const query = database.queries[0];
    assert.match(query.sql, /sessions\.expires_at > now\(\)/);
    assert.deepEqual(query.params, ['hashed-token']);
});

test('unique constraint helper supports sqlite and postgres conflict codes', () => {
    assert.equal(isUniqueConstraintError({ code: 'SQLITE_CONSTRAINT_UNIQUE' }), true);
    assert.equal(isUniqueConstraintError({ code: '23505' }), true);
    assert.equal(isUniqueConstraintError({ code: 'ECONNRESET' }), false);
});

test('postgres account credential updates and session revocation stay parameterized', async () => {
    const database = createFakePostgresDatabase();
    const repository = createPostgresAuthRepository(database);

    const credentials = await repository.findUserCredentialsById(7);
    const user = await repository.updateUsername(7, 'Narcis_Updated');
    await repository.updatePasswordHash(7, 'pbkdf2$new-hash');
    await repository.deleteOtherSessionsByUserId(7, 'current-token-hash');
    await repository.deleteSessionsByUserId(7);

    assert.equal(credentials.password_hash, 'hash');
    assert.equal(user.username, 'Narcis_Updated');
    assert.deepEqual(database.queries[0].params, [7]);
    assert.deepEqual(database.queries[1].params, [7, 'Narcis_Updated']);
    assert.deepEqual(database.queries[2].params, [7, 'pbkdf2$new-hash']);
    assert.deepEqual(database.queries[3].params, [7, 'current-token-hash']);
    assert.deepEqual(database.queries[4].params, [7]);
    assert.match(database.queries[3].sql, /token_hash <> \$2/);
});
