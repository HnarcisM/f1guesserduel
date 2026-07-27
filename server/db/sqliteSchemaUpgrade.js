const USER_MODERATION_COLUMNS = Object.freeze([
    Object.freeze({ name: 'account_status', definition: "TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended'))" }),
    Object.freeze({ name: 'suspended_until', definition: 'TEXT' }),
    Object.freeze({ name: 'suspension_reason', definition: 'TEXT' }),
    Object.freeze({ name: 'suspended_at', definition: 'TEXT' })
]);

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


function ensureSqliteUserModerationColumns(database) {
    if (!database || typeof database.exec !== 'function') {
        throw new Error('SQLite schema upgrade requires a database with exec().');
    }

    const existingColumns = getSqliteTableColumns(database, 'users');
    const addedColumns = [];
    for (const column of USER_MODERATION_COLUMNS) {
        if (existingColumns.has(column.name)) continue;
        database.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`);
        existingColumns.add(column.name);
        addedColumns.push(column.name);
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status, suspended_until)');
    return addedColumns;
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
    USER_MODERATION_COLUMNS,
    ACCOUNT_GAME_HISTORY_COLUMNS,
    getSqliteTableColumns,
    ensureSqliteUserModerationColumns,
    ensureSqliteAccountGameHistoryColumns
};
