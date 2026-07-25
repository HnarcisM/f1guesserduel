'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureSqliteUserModerationColumns } = require('../server/db/sqliteSchemaUpgrade');

function createFakeDatabase(initialColumns = ['id', 'username', 'email', 'password_hash']) {
    const columns = new Set(initialColumns);
    const executed = [];
    return {
        executed,
        prepare(sql) {
            if (sql.startsWith('PRAGMA table_info')) {
                return { all() { return [...columns].map(name => ({ name })); } };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        },
        exec(sql) {
            executed.push(sql);
            const match = sql.match(/ALTER TABLE users ADD COLUMN ([a-z_]+)/i);
            if (match) columns.add(match[1]);
        }
    };
}

test('SQLite moderation upgrade is idempotent and startup invokes it', () => {
    const database = createFakeDatabase();
    assert.deepEqual(ensureSqliteUserModerationColumns(database), [
        'account_status', 'suspended_until', 'suspension_reason', 'suspended_at'
    ]);
    assert.deepEqual(ensureSqliteUserModerationColumns(database), []);
    const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'database.js'), 'utf8');
    assert.match(source, /ensureSqliteUserModerationColumns\(db\)/);
});
