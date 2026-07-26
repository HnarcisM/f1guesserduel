'use strict';

function normalizeUserId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDetails(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function createPostgresAdminOperationalRepository(database) {
    return {
        provider: 'postgres',
        async getModeDifficultyStats() {
            const result = await database.query(`
                SELECT
                    mode,
                    COALESCE(difficulty, 'unknown') AS difficulty,
                    COUNT(*)::int AS "gamesPlayed",
                    COUNT(DISTINCT user_id)::int AS "uniquePlayers",
                    COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
                    COUNT(*) FILTER (WHERE outcome = 'draw')::int AS draws,
                    COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
                    COALESCE(ROUND(AVG(attempts)::numeric, 2), 0)::float AS "averageAttempts",
                    COALESCE(ROUND(AVG(duration_ms)::numeric), 0)::int AS "averageDurationMs"
                FROM user_game_results
                GROUP BY mode, COALESCE(difficulty, 'unknown')
                ORDER BY mode, difficulty
            `);
            return result.rows || [];
        },
        async getSuspensionHistory(userId, limit = 50) {
            const normalizedUserId = normalizeUserId(userId);
            if (!normalizedUserId) return [];
            const result = await database.query(`
                SELECT
                    history.id,
                    history.event_type AS "eventType",
                    history.duration_key AS duration,
                    history.reason,
                    history.suspended_until AS "suspendedUntil",
                    history.details_json AS details,
                    history.created_at AS "createdAt",
                    admin.username AS "adminUsername"
                FROM user_suspension_history history
                JOIN users admin ON admin.id = history.admin_user_id
                WHERE history.user_id = $1
                ORDER BY history.created_at DESC, history.id DESC
                LIMIT $2
            `, [normalizedUserId, Math.min(Math.max(Number(limit) || 50, 1), 100)]);
            return (result.rows || []).map(row => ({ ...row, details: parseDetails(row.details) }));
        },
        async recordSuspensionHistory(entry) {
            const result = await database.query(`
                INSERT INTO user_suspension_history (
                    user_id, admin_user_id, event_type, duration_key, reason,
                    suspended_until, details_json
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                RETURNING id
            `, [
                entry.userId,
                entry.adminUserId,
                entry.eventType,
                entry.duration || null,
                entry.reason || null,
                entry.suspendedUntil || null,
                JSON.stringify(entry.details || {})
            ]);
            return Number(result.rows?.[0]?.id) || null;
        }
    };
}

function createSqliteAdminOperationalRepository(database) {
    const analyticsStatement = database.prepare(`
        SELECT
            mode,
            COALESCE(difficulty, 'unknown') AS difficulty,
            COUNT(*) AS gamesPlayed,
            COUNT(DISTINCT user_id) AS uniquePlayers,
            SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN outcome = 'draw' THEN 1 ELSE 0 END) AS draws,
            SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) AS losses,
            ROUND(COALESCE(AVG(attempts), 0), 2) AS averageAttempts,
            ROUND(COALESCE(AVG(duration_ms), 0)) AS averageDurationMs
        FROM user_game_results
        GROUP BY mode, COALESCE(difficulty, 'unknown')
        ORDER BY mode, difficulty
    `);
    const historyStatement = database.prepare(`
        SELECT
            history.id,
            history.event_type AS eventType,
            history.duration_key AS duration,
            history.reason,
            history.suspended_until AS suspendedUntil,
            history.details_json AS details,
            history.created_at AS createdAt,
            admin.username AS adminUsername
        FROM user_suspension_history history
        JOIN users admin ON admin.id = history.admin_user_id
        WHERE history.user_id = ?
        ORDER BY datetime(history.created_at) DESC, history.id DESC
        LIMIT ?
    `);
    const historyInsert = database.prepare(`
        INSERT INTO user_suspension_history (
            user_id, admin_user_id, event_type, duration_key, reason,
            suspended_until, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return {
        provider: 'sqlite',
        async getModeDifficultyStats() {
            return analyticsStatement.all().map(row => ({
                ...row,
                gamesPlayed: Number(row.gamesPlayed) || 0,
                uniquePlayers: Number(row.uniquePlayers) || 0,
                wins: Number(row.wins) || 0,
                draws: Number(row.draws) || 0,
                losses: Number(row.losses) || 0,
                averageAttempts: Number(row.averageAttempts) || 0,
                averageDurationMs: Number(row.averageDurationMs) || 0
            }));
        },
        async getSuspensionHistory(userId, limit = 50) {
            const normalizedUserId = normalizeUserId(userId);
            if (!normalizedUserId) return [];
            return historyStatement.all(
                normalizedUserId,
                Math.min(Math.max(Number(limit) || 50, 1), 100)
            ).map(row => ({ ...row, details: parseDetails(row.details) }));
        },
        async recordSuspensionHistory(entry) {
            const result = historyInsert.run(
                entry.userId,
                entry.adminUserId,
                entry.eventType,
                entry.duration || null,
                entry.reason || null,
                entry.suspendedUntil || null,
                JSON.stringify(entry.details || {})
            );
            return Number(result.lastInsertRowid) || null;
        }
    };
}

function createAdminOperationalRepository(database) {
    if (!database) throw new Error('Admin operational repository requires a database.');
    return database.provider === 'postgres'
        ? createPostgresAdminOperationalRepository(database)
        : createSqliteAdminOperationalRepository(database);
}

module.exports = {
    createAdminOperationalRepository,
    createPostgresAdminOperationalRepository,
    createSqliteAdminOperationalRepository,
    normalizeUserId,
    parseDetails
};
