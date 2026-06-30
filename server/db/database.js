const fs = require('fs');
const path = require('path');

function createDatabase({ dbFilePath, schemaFilePath }) {
    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (error) {
        throw new Error(
            "Lipsește dependența 'better-sqlite3'. Rulează `npm install` înainte de `npm start`."
        );
    }

    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

    const db = new Database(dbFilePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(schemaFilePath, 'utf8');
    db.exec(schema);

    return db;
}

module.exports = {
    createDatabase
};
