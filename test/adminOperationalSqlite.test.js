'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createRuntimeSettingsRepository } = require('../server/runtime/runtimeSettingsRepository');
const { createAdminOperationalRepository } = require('../server/admin/adminOperationalRepository');

function createDatabase(t) {
    let database;
    try {
        database = new Database(':memory:');
    } catch (error) {
        if (error?.code === 'ERR_DLOPEN_FAILED') {
            t.skip('better-sqlite3 is not compiled for the local Node.js runtime');
            return null;
        }
        throw error;
    }
    database.pragma('foreign_keys = ON');
    database.exec(fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8'));
    t.after(() => database.close());
    return database;
}

test('SQLite persists operational settings and suspension history', async t => {
    const database = createDatabase(t);
    if (!database) return;
    database.prepare(`
        INSERT INTO users (account_uuid, username, email, password_hash)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
        '11111111-2222-4333-8444-555555555555', 'Admin', 'admin@example.test', 'hash',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Driver', 'driver@example.test', 'hash'
    );

    const runtimeRepository = createRuntimeSettingsRepository(database);
    await runtimeRepository.save({
        updatedBy: 1,
        settings: {
            maintenance: { enabled: true, message: 'Actualizare programată' },
            announcement: { enabled: true, message: 'Mesaj global', level: 'warning' },
            modes: { duel: false }
        }
    });
    const storedSettings = await runtimeRepository.load();
    assert.equal(storedSettings.updatedBy, 1);
    assert.equal(storedSettings.settings.maintenance.enabled, true);
    assert.equal(storedSettings.settings.modes.duel, false);
    assert.equal(storedSettings.settings.modes.classic, true);

    const operationalRepository = createAdminOperationalRepository(database);
    const historyId = await operationalRepository.recordSuspensionHistory({
        userId: 2,
        adminUserId: 1,
        eventType: 'suspended',
        duration: '24h',
        reason: 'Test administrativ',
        suspendedUntil: '2026-07-27T12:00:00.000Z',
        details: { revokedSessions: 2 }
    });
    assert.equal(historyId, 1);
    const history = await operationalRepository.getSuspensionHistory(2);
    assert.equal(history.length, 1);
    assert.equal(history[0].eventType, 'suspended');
    assert.equal(history[0].adminUsername, 'Admin');
    assert.equal(history[0].details.revokedSessions, 2);
});
