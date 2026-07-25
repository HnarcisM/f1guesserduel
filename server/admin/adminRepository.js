'use strict';

function normalizeLimit(value, fallback = 25, max = 100) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function normalizeOffset(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSearch(value) {
    return String(value || '').trim().slice(0, 100);
}

function parseAuditDetails(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function createPostgresAdminRepository(database) {
    async function getOverview({ weekKey }) {
        const result = await database.query(`
            SELECT
                (SELECT COUNT(*)::int FROM users) AS "totalUsers",
                (SELECT COUNT(*)::int FROM users WHERE last_seen_at >= now() - INTERVAL '24 hours') AS "activeUsers24h",
                (SELECT COUNT(*)::int FROM sessions WHERE expires_at > now()) AS "activeSessions",
                (SELECT COUNT(*)::int FROM user_game_results WHERE completed_at >= now() - INTERVAL '24 hours') AS "gamesLast24h",
                (SELECT COUNT(*)::int FROM user_daily_attempts WHERE daily_date = CURRENT_DATE) AS "dailyAttemptsToday",
                (SELECT COUNT(*)::int FROM user_weekly_attempts WHERE week_key = $1) AS "weeklyAttemptsCurrent"
        `, [weekKey]);
        return result.rows?.[0] || {};
    }

    async function listUsers({ search, limit, offset }) {
        const cleanSearch = normalizeSearch(search);
        const pageLimit = normalizeLimit(limit);
        const pageOffset = normalizeOffset(offset);
        const pattern = `%${cleanSearch}%`;
        const params = cleanSearch ? [pattern, pageLimit, pageOffset] : [pageLimit, pageOffset];
        const where = cleanSearch
            ? 'WHERE users.username ILIKE $1 OR users.email ILIKE $1 OR CAST(users.id AS TEXT) ILIKE $1'
            : '';
        const limitIndex = cleanSearch ? 2 : 1;
        const offsetIndex = cleanSearch ? 3 : 2;

        const [rowsResult, countResult] = await Promise.all([
            database.query(`
                SELECT
                    users.id,
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    users.last_seen_at AS "lastSeenAt",
                    COALESCE((SELECT total_xp FROM user_progress WHERE user_id = users.id), 0)::int AS "totalXp",
                    COALESCE((SELECT COUNT(*) FROM sessions WHERE user_id = users.id AND expires_at > now()), 0)::int AS "activeSessions",
                    COALESCE((SELECT SUM(games_played) FROM user_game_stats WHERE user_id = users.id), 0)::int AS "gamesPlayed",
                    COALESCE((SELECT SUM(games_won) FROM user_game_stats WHERE user_id = users.id), 0)::int AS "gamesWon"
                FROM users
                ${where}
                ORDER BY COALESCE(users.last_seen_at, users.created_at) DESC, users.id DESC
                LIMIT $${limitIndex} OFFSET $${offsetIndex}
            `, params),
            database.query(`
                SELECT COUNT(*)::int AS total
                FROM users
                ${where}
            `, cleanSearch ? [pattern] : [])
        ]);

        return {
            users: rowsResult.rows || [],
            total: Number(countResult.rows?.[0]?.total) || 0,
            limit: pageLimit,
            offset: pageOffset
        };
    }

    async function recordAudit(entry) {
        const result = await database.query(`
            INSERT INTO admin_audit_log (
                admin_user_id, action, target_type, target_id, details_json, request_id
            ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            RETURNING id
        `, [
            entry.adminUserId,
            entry.action,
            entry.targetType || null,
            entry.targetId || null,
            JSON.stringify(entry.details || {}),
            entry.requestId || null
        ]);
        return result.rows?.[0]?.id || null;
    }

    async function listAudit({ limit = 50 } = {}) {
        const pageLimit = normalizeLimit(limit, 50, 100);
        const result = await database.query(`
            SELECT
                audit.id,
                audit.action,
                audit.target_type AS "targetType",
                audit.target_id AS "targetId",
                audit.details_json AS details,
                audit.request_id AS "requestId",
                audit.created_at AS "createdAt",
                users.username AS "adminUsername"
            FROM admin_audit_log audit
            JOIN users ON users.id = audit.admin_user_id
            ORDER BY audit.created_at DESC, audit.id DESC
            LIMIT $1
        `, [pageLimit]);
        return (result.rows || []).map(row => ({ ...row, details: parseAuditDetails(row.details) }));
    }

    return { getOverview, listUsers, recordAudit, listAudit };
}

function createSqliteAdminRepository(database) {
    const overviewStatement = database.prepare(`
        SELECT
            (SELECT COUNT(*) FROM users) AS totalUsers,
            (SELECT COUNT(*) FROM users WHERE datetime(last_seen_at) >= datetime('now', '-24 hours')) AS activeUsers24h,
            (SELECT COUNT(*) FROM sessions WHERE datetime(expires_at) > datetime('now')) AS activeSessions,
            (SELECT COUNT(*) FROM user_game_results WHERE datetime(completed_at) >= datetime('now', '-24 hours')) AS gamesLast24h,
            (SELECT COUNT(*) FROM user_daily_attempts WHERE daily_date = date('now')) AS dailyAttemptsToday,
            (SELECT COUNT(*) FROM user_weekly_attempts WHERE week_key = ?) AS weeklyAttemptsCurrent
    `);
    const auditInsert = database.prepare(`
        INSERT INTO admin_audit_log (
            admin_user_id, action, target_type, target_id, details_json, request_id
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const auditList = database.prepare(`
        SELECT
            audit.id,
            audit.action,
            audit.target_type AS targetType,
            audit.target_id AS targetId,
            audit.details_json AS details,
            audit.request_id AS requestId,
            audit.created_at AS createdAt,
            users.username AS adminUsername
        FROM admin_audit_log audit
        JOIN users ON users.id = audit.admin_user_id
        ORDER BY audit.created_at DESC, audit.id DESC
        LIMIT ?
    `);

    async function getOverview({ weekKey }) {
        return overviewStatement.get(weekKey) || {};
    }

    async function listUsers({ search, limit, offset }) {
        const cleanSearch = normalizeSearch(search);
        const pageLimit = normalizeLimit(limit);
        const pageOffset = normalizeOffset(offset);
        const pattern = `%${cleanSearch}%`;
        const where = cleanSearch
            ? 'WHERE users.username LIKE ? COLLATE NOCASE OR users.email LIKE ? COLLATE NOCASE OR CAST(users.id AS TEXT) = ?'
            : '';
        const query = database.prepare(`
            SELECT
                users.id,
                users.username,
                users.email,
                users.created_at AS createdAt,
                users.last_seen_at AS lastSeenAt,
                COALESCE((SELECT total_xp FROM user_progress WHERE user_id = users.id), 0) AS totalXp,
                COALESCE((SELECT COUNT(*) FROM sessions WHERE user_id = users.id AND datetime(expires_at) > datetime('now')), 0) AS activeSessions,
                COALESCE((SELECT SUM(games_played) FROM user_game_stats WHERE user_id = users.id), 0) AS gamesPlayed,
                COALESCE((SELECT SUM(games_won) FROM user_game_stats WHERE user_id = users.id), 0) AS gamesWon
            FROM users
            ${where}
            ORDER BY COALESCE(users.last_seen_at, users.created_at) DESC, users.id DESC
            LIMIT ? OFFSET ?
        `);
        const countQuery = database.prepare(`SELECT COUNT(*) AS total FROM users ${where}`);
        const searchParams = cleanSearch ? [pattern, pattern, cleanSearch] : [];
        return {
            users: query.all(...searchParams, pageLimit, pageOffset),
            total: Number(countQuery.get(...searchParams)?.total) || 0,
            limit: pageLimit,
            offset: pageOffset
        };
    }

    async function recordAudit(entry) {
        const result = auditInsert.run(
            entry.adminUserId,
            entry.action,
            entry.targetType || null,
            entry.targetId || null,
            JSON.stringify(entry.details || {}),
            entry.requestId || null
        );
        return Number(result.lastInsertRowid) || null;
    }

    async function listAudit({ limit = 50 } = {}) {
        return auditList.all(normalizeLimit(limit, 50, 100))
            .map(row => ({ ...row, details: parseAuditDetails(row.details) }));
    }

    return { getOverview, listUsers, recordAudit, listAudit };
}

function createAdminRepository(database) {
    if (!database) throw new Error('Admin repository requires a database.');
    return database.provider === 'postgres'
        ? createPostgresAdminRepository(database)
        : createSqliteAdminRepository(database);
}

module.exports = {
    createAdminRepository,
    createPostgresAdminRepository,
    createSqliteAdminRepository,
    normalizeLimit,
    normalizeOffset,
    normalizeSearch
};
