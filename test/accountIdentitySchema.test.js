'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureSqliteUserAccountUuid } = require('../server/db/sqliteAccountIdentityUpgrade');

const UUIDS = [
    '11111111-2222-4333-8444-555555555555',
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
];

function createFakeDatabase() {
    const columns = new Set(['id', 'username', 'email', 'password_hash']);
    const users = [{ id: 1, accountUuid: null }, { id: 2, accountUuid: null }];
    const executed = [];
    return {
        users,
        executed,
        prepare(sql) {
            if (sql.startsWith('PRAGMA table_info')) return { all: () => [...columns].map(name => ({ name })) };
            if (sql.startsWith('SELECT id, account_uuid')) return { all: () => users.map(user => ({ ...user })) };
            if (sql.startsWith('UPDATE users SET account_uuid')) {
                return { run(accountUuid, id) { users.find(user => user.id === id).accountUuid = accountUuid; return { changes: 1 }; } };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        },
        exec(sql) {
            executed.push(sql);
            if (sql.includes('ALTER TABLE users ADD COLUMN account_uuid')) columns.add('account_uuid');
        },
        transaction(action) { return action; }
    };
}

test('SQLite upgrade backfills immutable UUIDs and is idempotent', () => {
    const database = createFakeDatabase();
    let index = 0;
    const first = ensureSqliteUserAccountUuid(database, { uuidFactory: () => UUIDS[index++] });
    assert.deepEqual(first, { columnAdded: true, backfilled: 2 });
    assert.deepEqual(database.users.map(user => user.accountUuid), UUIDS);
    const second = ensureSqliteUserAccountUuid(database, { uuidFactory: () => assert.fail('must not generate again') });
    assert.deepEqual(second, { columnAdded: false, backfilled: 0 });
    assert.equal(database.executed.some(sql => sql.includes('idx_users_account_uuid')), true);
    const startup = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'database.js'), 'utf8');
    assert.match(startup, /ensureSqliteUserAccountUuid\(db\)/);
});


test('Postgres and fresh SQLite schemas enforce permanent account UUIDs', () => {
    const root = path.join(__dirname, '..');
    const migration = fs.readFileSync(path.join(root, 'server', 'db', 'migrations', 'postgres', '012_user_account_uuid.sql'), 'utf8');
    const sqliteSchema = fs.readFileSync(path.join(root, 'server', 'db', 'schema.sql'), 'utf8');
    const authRepository = fs.readFileSync(path.join(root, 'server', 'auth', 'authRepository.js'), 'utf8');
    assert.match(migration, /ADD COLUMN IF NOT EXISTS account_uuid UUID/);
    assert.match(migration, /SET account_uuid = gen_random_uuid\(\)/);
    assert.match(migration, /ALTER COLUMN account_uuid SET NOT NULL/);
    assert.match(migration, /idx_users_account_uuid/);
    assert.match(sqliteSchema, /account_uuid TEXT NOT NULL UNIQUE/);
    assert.match(authRepository, /INSERT INTO users \(account_uuid, username, email, password_hash/);
    assert.match(authRepository, /users\.account_uuid AS "accountUuid"/);
});
