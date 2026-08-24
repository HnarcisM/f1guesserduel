'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('sqlite password reset schema stores only a bounded token hash per user', () => {
    const schema = read('server/db/schema.sql');
    const table = schema.match(/CREATE TABLE IF NOT EXISTS password_reset_tokens \([\s\S]*?\n\);/)?.[0] || '';

    assert.match(table, /user_id INTEGER PRIMARY KEY/);
    assert.match(table, /token_hash TEXT NOT NULL UNIQUE CHECK \(length\(token_hash\) = 64\)/);
    assert.match(table, /expires_at TEXT NOT NULL/);
    assert.match(table, /consumed_at TEXT/);
    assert.match(table, /REFERENCES users\(id\) ON DELETE CASCADE/);
    assert.doesNotMatch(table, /\btoken\s+TEXT\b/);
});

test('postgres password reset migration mirrors the one-token-per-user and hashed-token constraints', () => {
    const migration = read('server/db/migrations/postgres/015_password_reset_tokens.sql');

    assert.match(migration, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
    assert.match(migration, /user_id INTEGER PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
    assert.match(migration, /token_hash TEXT NOT NULL UNIQUE CHECK \(char_length\(token_hash\) = 64\)/);
    assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/);
    assert.match(migration, /consumed_at TIMESTAMPTZ/);
    assert.match(migration, /idx_password_reset_tokens_expires_at/);
    assert.doesNotMatch(migration, /\btoken\s+TEXT\b/);
});
