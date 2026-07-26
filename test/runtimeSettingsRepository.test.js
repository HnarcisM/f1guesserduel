'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createPostgresRuntimeSettingsRepository,
    parseValue
} = require('../server/runtime/runtimeSettingsRepository');

const ACCOUNT_UUID_SETTINGS = {
    maintenance: { enabled: false, message: 'Mentenanță' },
    announcement: { enabled: true, message: 'Mesaj global', level: 'warning' },
    modes: { duel: false }
};

test('runtime settings repository parses JSON defensively', () => {
    assert.deepEqual(parseValue('{"modes":{"duel":false}}'), { modes: { duel: false } });
    assert.deepEqual(parseValue({ modes: { classic: true } }), { modes: { classic: true } });
    assert.equal(parseValue('{invalid'), null);
    assert.equal(parseValue(null), null);
});

test('Postgres runtime settings repository uses one parameterized upsert key', async () => {
    const queries = [];
    const database = {
        async query(sql, params) {
            queries.push({ sql: sql.trim(), params });
            if (sql.includes('SELECT value_json')) {
                return {
                    rows: [{
                        value: ACCOUNT_UUID_SETTINGS,
                        updatedBy: 7,
                        updatedAt: '2026-07-26T12:00:00.000Z'
                    }]
                };
            }
            return {
                rows: [{ updatedBy: params[2], updatedAt: '2026-07-26T12:05:00.000Z' }]
            };
        }
    };
    const repository = createPostgresRuntimeSettingsRepository(database);

    const loaded = await repository.load();
    assert.equal(loaded.settings.modes.duel, false);
    assert.equal(loaded.settings.modes.classic, true);

    const saved = await repository.save({ settings: ACCOUNT_UUID_SETTINGS, updatedBy: 7 });
    assert.equal(saved.updatedBy, 7);
    assert.match(queries[1].sql, /ON CONFLICT \(setting_key\) DO UPDATE/);
    assert.deepEqual(queries[1].params.slice(0, 1), ['operational-controls']);
    assert.equal(JSON.parse(queries[1].params[1]).modes.duel, false);
    assert.equal(queries[1].params[2], 7);
    assert.equal(queries[1].sql.includes('Mesaj global'), false);
});
