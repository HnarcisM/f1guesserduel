'use strict';

const { generateAccountUuid, normalizeAccountUuid } = require('../auth/accountIdentity');
const { getSqliteTableColumns } = require('./sqliteSchemaUpgrade');

function ensureSqliteUserAccountUuid(database, { uuidFactory = generateAccountUuid } = {}) {
    if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
        throw new Error('SQLite account identity upgrade requires prepare() and exec().');
    }

    const columns = getSqliteTableColumns(database, 'users');
    const columnAdded = !columns.has('account_uuid');
    if (columnAdded) database.exec('ALTER TABLE users ADD COLUMN account_uuid TEXT');

    const rows = database.prepare('SELECT id, account_uuid AS accountUuid FROM users ORDER BY id').all();
    const update = database.prepare('UPDATE users SET account_uuid = ? WHERE id = ?');
    const seen = new Set();
    const updates = [];

    for (const row of rows) {
        let accountUuid = normalizeAccountUuid(row.accountUuid);
        if (!accountUuid || seen.has(accountUuid)) {
            do accountUuid = normalizeAccountUuid(uuidFactory());
            while (!accountUuid || seen.has(accountUuid));
            updates.push([accountUuid, row.id]);
        } else if (accountUuid !== row.accountUuid) {
            updates.push([accountUuid, row.id]);
        }
        seen.add(accountUuid);
    }

    const applyUpdates = () => updates.forEach(([accountUuid, userId]) => update.run(accountUuid, userId));
    if (typeof database.transaction === 'function') database.transaction(applyUpdates)();
    else applyUpdates();

    database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_uuid ON users(account_uuid);
        CREATE TRIGGER IF NOT EXISTS trg_users_account_uuid_insert
        BEFORE INSERT ON users
        WHEN NEW.account_uuid IS NULL OR trim(NEW.account_uuid) = ''
        BEGIN
            SELECT RAISE(ABORT, 'users.account_uuid is required');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_users_account_uuid_update
        BEFORE UPDATE OF account_uuid ON users
        WHEN NEW.account_uuid IS NULL OR trim(NEW.account_uuid) = ''
        BEGIN
            SELECT RAISE(ABORT, 'users.account_uuid is required');
        END;
    `);

    return { columnAdded, backfilled: updates.length };
}

module.exports = { ensureSqliteUserAccountUuid };
