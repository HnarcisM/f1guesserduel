const fs = require('fs');
const path = require('path');

function createSqliteDatabase({ dbFilePath, schemaFilePath }) {
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

    db.provider = 'sqlite';
    db.check = () => {
        db.prepare('SELECT 1 AS ok').get();
        return { ok: true };
    };
    db.closeConnection = () => db.close?.();

    return db;
}

async function createPostgresDatabase({ databaseUrl, schemaFilePath, ssl = true, logger = console }) {
    if (!databaseUrl || typeof databaseUrl !== 'string') {
        throw new Error('DATABASE_URL must be set when DATABASE_PROVIDER=postgres.');
    }

    let Pool;
    try {
        ({ Pool } = require('pg'));
    } catch (error) {
        throw new Error(
            "Lipsește dependența 'pg'. Rulează `npm install` înainte de `npm start`."
        );
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: ssl ? { rejectUnauthorized: false } : false
    });

    const schema = fs.readFileSync(schemaFilePath, 'utf8');
    await pool.query(schema);
    logger?.info?.('Postgres database initialized.', { databaseProvider: 'postgres' });

    return {
        provider: 'postgres',
        pool,
        async query(sql, params = []) {
            return pool.query(sql, params);
        },
        async check() {
            await pool.query('SELECT 1 AS ok');
            return { ok: true };
        },
        async closeConnection() {
            await pool.end();
        }
    };
}

async function createDatabase(options = {}) {
    const provider = options.provider || options.databaseProvider || 'sqlite';

    if (provider === 'postgres') {
        return createPostgresDatabase({
            databaseUrl: options.databaseUrl,
            schemaFilePath: options.postgresSchemaFilePath || options.schemaFilePath,
            ssl: options.postgresSsl ?? true,
            logger: options.logger
        });
    }

    if (provider !== 'sqlite') {
        throw new Error(`Unsupported database provider: ${provider}`);
    }

    return createSqliteDatabase(options);
}

module.exports = {
    createDatabase,
    createSqliteDatabase,
    createPostgresDatabase
};
