'use strict';

const { getSqliteTableColumns } = require('./sqliteSchemaUpgrade');

const ACCOUNT_ACTIVITY_COLUMNS = Object.freeze([
    Object.freeze({ name: 'active_days', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK (active_days >= 0)' }),
    Object.freeze({ name: 'last_active_date', definition: 'TEXT' })
]);

const ACCOUNT_ACTIVITY_BACKFILL_SQL = `
    INSERT OR IGNORE INTO user_progress (
        user_id, total_xp, active_days, last_active_date, updated_at
    )
    SELECT
        user_id,
        0,
        COUNT(DISTINCT date(completed_at)),
        MAX(date(completed_at)),
        datetime('now')
    FROM user_game_results
    GROUP BY user_id;

    UPDATE user_progress
    SET
        active_days = MAX(
            active_days,
            COALESCE((
                SELECT COUNT(DISTINCT date(results.completed_at))
                FROM user_game_results AS results
                WHERE results.user_id = user_progress.user_id
            ), 0)
        ),
        last_active_date = CASE
            WHEN (
                SELECT MAX(date(results.completed_at))
                FROM user_game_results AS results
                WHERE results.user_id = user_progress.user_id
            ) > COALESCE(last_active_date, '')
            THEN (
                SELECT MAX(date(results.completed_at))
                FROM user_game_results AS results
                WHERE results.user_id = user_progress.user_id
            )
            ELSE last_active_date
        END;
`;

function ensureSqliteAccountActivityColumns(database) {
    if (!database || typeof database.exec !== 'function') {
        throw new Error('SQLite account activity upgrade requires a database with exec().');
    }

    const existingColumns = getSqliteTableColumns(database, 'user_progress');
    const addedColumns = [];

    for (const column of ACCOUNT_ACTIVITY_COLUMNS) {
        if (existingColumns.has(column.name)) continue;
        database.exec(`ALTER TABLE user_progress ADD COLUMN ${column.name} ${column.definition}`);
        existingColumns.add(column.name);
        addedColumns.push(column.name);
    }

    if (addedColumns.length > 0) database.exec(ACCOUNT_ACTIVITY_BACKFILL_SQL);
    return addedColumns;
}

module.exports = {
    ACCOUNT_ACTIVITY_BACKFILL_SQL,
    ACCOUNT_ACTIVITY_COLUMNS,
    ensureSqliteAccountActivityColumns
};
