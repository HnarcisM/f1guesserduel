'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createSqliteDatabase } = require('../server/db/database');
const { createSqlitePasswordResetRepository } = require('../server/auth/passwordResetRepository');

function createTestDatabase() {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-password-reset-'));
    const dbFilePath = path.join(tempDirectory, 'test.sqlite');
    const schemaFilePath = path.join(__dirname, '..', 'server', 'db', 'schema.sql');
    const db = createSqliteDatabase({ dbFilePath, schemaFilePath });
    return { db, tempDirectory };
}

test('sqlite password reset is one-time and revokes every existing session atomically', async t => {
    const { db, tempDirectory } = createTestDatabase();
    t.after(() => {
        db.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    const userResult = db.prepare(`
        INSERT INTO users (account_uuid, username, email, password_hash)
        VALUES (?, ?, ?, ?)
    `).run(
        '11111111-2222-4333-8444-555555555555',
        'Narcis',
        'narcis@example.com',
        'old-password-hash'
    );
    const userId = Number(userResult.lastInsertRowid);
    const sessionInsert = db.prepare(`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `);
    sessionInsert.run(userId, 'session-1', '2099-01-01T00:00:00.000Z');
    sessionInsert.run(userId, 'session-2', '2099-01-01T00:00:00.000Z');

    const repository = createSqlitePasswordResetRepository(db);
    const tokenHash = 'a'.repeat(64);
    const issued = await repository.replaceTokenForEmail({
        email: 'NARCIS@example.com',
        tokenHash,
        expiresAt: '2099-01-01T00:00:00.000Z'
    });
    const reset = await repository.consumeTokenAndResetPassword({
        tokenHash,
        passwordHash: 'new-password-hash'
    });
    const reused = await repository.consumeTokenAndResetPassword({
        tokenHash,
        passwordHash: 'unexpected-second-hash'
    });

    assert.equal(issued.userId, userId);
    assert.deepEqual(reset, { userId, sessionsRevoked: 2 });
    assert.equal(reused, null);
    assert.equal(
        db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId).password_hash,
        'new-password-hash'
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(userId).count, 0);
    assert.ok(
        db.prepare('SELECT consumed_at FROM password_reset_tokens WHERE user_id = ?').get(userId).consumed_at
    );
});

test('sqlite expired reset tokens do not change the password', async t => {
    const { db, tempDirectory } = createTestDatabase();
    t.after(() => {
        db.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    const userResult = db.prepare(`
        INSERT INTO users (account_uuid, username, email, password_hash)
        VALUES (?, ?, ?, ?)
    `).run(
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        'ExpiredUser',
        'expired@example.com',
        'old-password-hash'
    );
    const userId = Number(userResult.lastInsertRowid);
    const repository = createSqlitePasswordResetRepository(db);
    const tokenHash = 'b'.repeat(64);

    await repository.replaceTokenForEmail({
        email: 'expired@example.com',
        tokenHash,
        expiresAt: '2000-01-01T00:00:00.000Z'
    });
    const reset = await repository.consumeTokenAndResetPassword({
        tokenHash,
        passwordHash: 'new-password-hash'
    });

    assert.equal(reset, null);
    assert.equal(
        db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId).password_hash,
        'old-password-hash'
    );
});
