'use strict';

const { RUNTIME_SETTINGS_KEY, normalizeRuntimeSettings } = require('./runtimeSettingsCatalog');

function parseValue(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function createPostgresRuntimeSettingsRepository(database) {
    return {
        provider: 'postgres',
        async load() {
            const result = await database.query(`
                SELECT value_json AS value, updated_by AS "updatedBy", updated_at AS "updatedAt"
                FROM app_runtime_settings
                WHERE setting_key = $1
            `, [RUNTIME_SETTINGS_KEY]);
            const row = result.rows?.[0] || null;
            return row ? {
                settings: normalizeRuntimeSettings(parseValue(row.value)),
                updatedBy: row.updatedBy || null,
                updatedAt: row.updatedAt || null
            } : null;
        },
        async save({ settings, updatedBy }) {
            const result = await database.query(`
                INSERT INTO app_runtime_settings (setting_key, value_json, updated_by, updated_at)
                VALUES ($1, $2::jsonb, $3, now())
                ON CONFLICT (setting_key) DO UPDATE SET
                    value_json = EXCLUDED.value_json,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = now()
                RETURNING updated_by AS "updatedBy", updated_at AS "updatedAt"
            `, [RUNTIME_SETTINGS_KEY, JSON.stringify(normalizeRuntimeSettings(settings)), updatedBy || null]);
            return {
                settings: normalizeRuntimeSettings(settings),
                updatedBy: result.rows?.[0]?.updatedBy || null,
                updatedAt: result.rows?.[0]?.updatedAt || null
            };
        }
    };
}

function createSqliteRuntimeSettingsRepository(database) {
    const loadStatement = database.prepare(`
        SELECT value_json AS value, updated_by AS updatedBy, updated_at AS updatedAt
        FROM app_runtime_settings
        WHERE setting_key = ?
    `);
    const saveStatement = database.prepare(`
        INSERT INTO app_runtime_settings (setting_key, value_json, updated_by, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(setting_key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_by = excluded.updated_by,
            updated_at = datetime('now')
    `);
    return {
        provider: 'sqlite',
        async load() {
            const row = loadStatement.get(RUNTIME_SETTINGS_KEY) || null;
            return row ? {
                settings: normalizeRuntimeSettings(parseValue(row.value)),
                updatedBy: row.updatedBy || null,
                updatedAt: row.updatedAt || null
            } : null;
        },
        async save({ settings, updatedBy }) {
            const normalized = normalizeRuntimeSettings(settings);
            saveStatement.run(RUNTIME_SETTINGS_KEY, JSON.stringify(normalized), updatedBy || null);
            const row = loadStatement.get(RUNTIME_SETTINGS_KEY);
            return {
                settings: normalized,
                updatedBy: row?.updatedBy || null,
                updatedAt: row?.updatedAt || null
            };
        }
    };
}

function createRuntimeSettingsRepository(database) {
    if (!database) throw new Error('Runtime settings repository requires a database.');
    return database.provider === 'postgres'
        ? createPostgresRuntimeSettingsRepository(database)
        : createSqliteRuntimeSettingsRepository(database);
}

module.exports = {
    createPostgresRuntimeSettingsRepository,
    createRuntimeSettingsRepository,
    createSqliteRuntimeSettingsRepository,
    parseValue
};
