const ACCOUNT_GAME_HISTORY_COLUMNS = Object.freeze([
    Object.freeze({ name: 'target_driver_id', definition: 'TEXT' }),
    Object.freeze({ name: 'target_driver_name', definition: 'TEXT' }),
    Object.freeze({ name: 'duration_ms', definition: 'INTEGER' }),
    Object.freeze({ name: 'room_id', definition: 'TEXT' }),
    Object.freeze({ name: 'match_id', definition: 'TEXT' }),
    Object.freeze({ name: 'opponent_username', definition: 'TEXT' }),
    Object.freeze({ name: 'winner_username', definition: 'TEXT' })
]);

function getSqliteTableColumns(database, tableName) {
    if (!database || typeof database.prepare !== 'function') {
        throw new Error('SQLite schema upgrade requires a database with prepare().');
    }
    if (typeof tableName !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
        throw new Error('Invalid SQLite table name.');
    }

    return new Set(
        database.prepare(`PRAGMA table_info(${tableName})`).all()
            .map(column => column?.name)
            .filter(Boolean)
    );
}

function ensureSqliteAccountGameHistoryColumns(database) {
    if (!database || typeof database.exec !== 'function') {
        throw new Error('SQLite schema upgrade requires a database with exec().');
    }

    const existingColumns = getSqliteTableColumns(database, 'user_game_results');
    const addedColumns = [];

    for (const column of ACCOUNT_GAME_HISTORY_COLUMNS) {
        if (existingColumns.has(column.name)) continue;
        database.exec(`ALTER TABLE user_game_results ADD COLUMN ${column.name} ${column.definition}`);
        existingColumns.add(column.name);
        addedColumns.push(column.name);
    }

    return addedColumns;
}

module.exports = {
    ACCOUNT_GAME_HISTORY_COLUMNS,
    getSqliteTableColumns,
    ensureSqliteAccountGameHistoryColumns
};
