'use strict';

function normalizeLimit(value, fallback = 25, max = 100) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function normalizeOffset(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSearch(value, maxLength = 100) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeUserId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

function normalizeUserDetails(payload) {
    if (!payload?.user) return null;
    return {
        user: payload.user,
        stats: payload.stats || [],
        recentResults: payload.recentResults || [],
        dailyAttempts: payload.dailyAttempts || [],
        weeklyAttempts: payload.weeklyAttempts || []
    };
}

function createPostgresAdminRepository(database) {
    async function getOverview({ weekKey, todayKey }) {
        const [overviewResult, trendResult] = await Promise.all([
            database.query(`
                SELECT
                    (SELECT COUNT(*)::int FROM users) AS "totalUsers",
                    (SELECT COUNT(*)::int FROM users WHERE last_seen_at >= now() - INTERVAL '24 hours') AS "activeUsers24h",
                    (SELECT COUNT(*)::int FROM users WHERE account_status = 'suspended' AND (suspended_until IS NULL OR suspended_until > now())) AS "suspendedUsers",
                    (SELECT COUNT(*)::int FROM sessions WHERE expires_at > now()) AS "activeSessions",
                    (SELECT COUNT(*)::int FROM user_game_results WHERE completed_at >= now() - INTERVAL '24 hours') AS "gamesLast24h",
                    (SELECT COUNT(*)::int FROM user_daily_attempts WHERE daily_date = $2::date) AS "dailyAttemptsToday",
                    (SELECT COUNT(*)::int FROM user_weekly_attempts WHERE week_key = $1) AS "weeklyAttemptsCurrent"
            `, [weekKey, todayKey]),
            database.query(`
                WITH days AS (
                    SELECT generate_series(
                        $1::date - INTERVAL '6 days',
                        $1::date,
                        INTERVAL '1 day'
                    )::date AS day
                )
                SELECT
                    to_char(day, 'YYYY-MM-DD') AS date,
                    (SELECT COUNT(*)::int FROM users WHERE created_at >= day AND created_at < day + INTERVAL '1 day') AS "usersCreated",
                    (SELECT COUNT(*)::int FROM user_game_results WHERE completed_at >= day AND completed_at < day + INTERVAL '1 day') AS "gamesCompleted",
                    (SELECT COUNT(*)::int FROM user_daily_attempts WHERE daily_date = day) AS "dailyAttempts",
                    (SELECT COUNT(*)::int FROM user_weekly_attempts WHERE started_at >= day AND started_at < day + INTERVAL '1 day') AS "weeklyAttempts"
                FROM days
                ORDER BY day
            `, [todayKey])
        ]);
        return {
            ...(overviewResult.rows?.[0] || {}),
            activityTrend: trendResult.rows || []
        };
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
                    users.account_uuid AS "accountUuid",
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    users.last_seen_at AS "lastSeenAt",
                    users.account_status AS "accountStatus",
                    users.suspended_until AS "suspendedUntil",
                    users.suspension_reason AS "suspensionReason",
                    users.suspended_at AS "suspendedAt",
                    CASE
                        WHEN users.account_status = 'suspended' AND (users.suspended_until IS NULL OR users.suspended_until > now()) THEN 'suspended'
                        ELSE 'active'
                    END AS "effectiveStatus",
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

    async function getUserDetails(userId) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId) return null;
        const [userResult, statsResult, recentResult, dailyResult, weeklyResult] = await Promise.all([
            database.query(`
                SELECT
                    users.id,
                    users.account_uuid AS "accountUuid",
                    users.username,
                    users.email,
                    users.created_at AS "createdAt",
                    users.last_seen_at AS "lastSeenAt",
                    users.account_status AS "accountStatus",
                    users.suspended_until AS "suspendedUntil",
                    users.suspension_reason AS "suspensionReason",
                    users.suspended_at AS "suspendedAt",
                    CASE
                        WHEN users.account_status = 'suspended' AND (users.suspended_until IS NULL OR users.suspended_until > now()) THEN 'suspended'
                        ELSE 'active'
                    END AS "effectiveStatus",
                    COALESCE(user_progress.total_xp, 0)::int AS "totalXp",
                    COALESCE((SELECT COUNT(*) FROM sessions WHERE user_id = users.id AND expires_at > now()), 0)::int AS "activeSessions"
                FROM users
                LEFT JOIN user_progress ON user_progress.user_id = users.id
                WHERE users.id = $1
            `, [normalizedUserId]),
            database.query(`
                SELECT
                    mode,
                    games_played AS "gamesPlayed",
                    games_won AS "gamesWon",
                    games_drawn AS "gamesDrawn",
                    current_streak AS "currentStreak",
                    best_streak AS "bestStreak",
                    guess_1 AS "guess1", guess_2 AS "guess2", guess_3 AS "guess3",
                    guess_4 AS "guess4", guess_5 AS "guess5", guess_6 AS "guess6"
                FROM user_game_stats
                WHERE user_id = $1
                ORDER BY mode
            `, [normalizedUserId]),
            database.query(`
                SELECT
                    mode, outcome, attempts, difficulty,
                    target_driver_name AS "targetDriverName",
                    duration_ms AS "durationMs",
                    opponent_username AS "opponentUsername",
                    completed_at AS "completedAt"
                FROM user_game_results
                WHERE user_id = $1
                ORDER BY completed_at DESC, id DESC
                LIMIT 20
            `, [normalizedUserId]),
            database.query(`
                SELECT
                    challenge_id AS "challengeId",
                    to_char(daily_date, 'YYYY-MM-DD') AS "dailyDate",
                    difficulty,
                    started_at AS "startedAt"
                FROM user_daily_attempts
                WHERE user_id = $1
                ORDER BY daily_date DESC, difficulty
                LIMIT 15
            `, [normalizedUserId]),
            database.query(`
                SELECT
                    week_key AS "weekKey",
                    challenge_id AS "challengeId",
                    difficulty,
                    score,
                    rounds_completed AS "roundsCompleted",
                    rounds_played AS "roundsPlayed",
                    finish_reason AS "finishReason",
                    started_at AS "startedAt",
                    finished_at AS "finishedAt"
                FROM user_weekly_attempts
                WHERE user_id = $1
                ORDER BY week_key DESC
                LIMIT 10
            `, [normalizedUserId])
        ]);
        return normalizeUserDetails({
            user: userResult.rows?.[0] || null,
            stats: statsResult.rows,
            recentResults: recentResult.rows,
            dailyAttempts: dailyResult.rows,
            weeklyAttempts: weeklyResult.rows
        });
    }

    async function setUserSuspension({ userId, reason, suspendedUntil }) {
        const result = await database.query(`
            UPDATE users
            SET
                account_status = 'suspended',
                suspended_until = $2,
                suspension_reason = $3,
                suspended_at = now()
            WHERE id = $1
            RETURNING id, username, suspended_until AS "suspendedUntil", suspension_reason AS "suspensionReason"
        `, [userId, suspendedUntil, reason]);
        return result.rows?.[0] || null;
    }

    async function clearUserSuspension(userId) {
        const result = await database.query(`
            UPDATE users
            SET account_status = 'active', suspended_until = NULL, suspension_reason = NULL, suspended_at = NULL
            WHERE id = $1
            RETURNING id, username
        `, [userId]);
        return result.rows?.[0] || null;
    }

    async function resetDailyAttempts({ userId, dailyDate }) {
        const result = await database.query(
            'DELETE FROM user_daily_attempts WHERE user_id = $1 AND daily_date = $2::date',
            [userId, dailyDate]
        );
        return Number(result.rowCount) || 0;
    }

    async function resetWeeklyAttempt({ userId, weekKey }) {
        const result = await database.query(
            'DELETE FROM user_weekly_attempts WHERE user_id = $1 AND week_key = $2',
            [userId, weekKey]
        );
        return Number(result.rowCount) || 0;
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

    async function listAudit({ limit = 50, offset = 0, action, search } = {}) {
        const pageLimit = normalizeLimit(limit, 50, 100);
        const pageOffset = normalizeOffset(offset);
        const cleanAction = normalizeSearch(action, 80);
        const cleanSearch = normalizeSearch(search);
        const conditions = [];
        const params = [];
        if (cleanAction) {
            params.push(`${cleanAction}%`);
            conditions.push(`audit.action ILIKE $${params.length}`);
        }
        if (cleanSearch) {
            params.push(`%${cleanSearch}%`);
            const index = params.length;
            conditions.push(`(
                audit.action ILIKE $${index}
                OR COALESCE(audit.target_id, '') ILIKE $${index}
                OR users.username ILIKE $${index}
                OR audit.details_json::text ILIKE $${index}
            )`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(pageLimit, pageOffset);
        const limitIndex = params.length - 1;
        const offsetIndex = params.length;
        const countParams = params.slice(0, -2);
        const [rowsResult, countResult] = await Promise.all([
            database.query(`
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
                ${where}
                ORDER BY audit.created_at DESC, audit.id DESC
                LIMIT $${limitIndex} OFFSET $${offsetIndex}
            `, params),
            database.query(`
                SELECT COUNT(*)::int AS total
                FROM admin_audit_log audit
                JOIN users ON users.id = audit.admin_user_id
                ${where}
            `, countParams)
        ]);
        return {
            entries: (rowsResult.rows || []).map(row => ({ ...row, details: parseAuditDetails(row.details) })),
            total: Number(countResult.rows?.[0]?.total) || 0,
            limit: pageLimit,
            offset: pageOffset
        };
    }

    return {
        getOverview,
        listUsers,
        getUserDetails,
        setUserSuspension,
        clearUserSuspension,
        resetDailyAttempts,
        resetWeeklyAttempt,
        recordAudit,
        listAudit
    };
}

function createSqliteAdminRepository(database) {
    const overviewStatement = database.prepare(`
        SELECT
            (SELECT COUNT(*) FROM users) AS totalUsers,
            (SELECT COUNT(*) FROM users WHERE datetime(last_seen_at) >= datetime('now', '-24 hours')) AS activeUsers24h,
            (SELECT COUNT(*) FROM users WHERE account_status = 'suspended' AND (suspended_until IS NULL OR datetime(suspended_until) > datetime('now'))) AS suspendedUsers,
            (SELECT COUNT(*) FROM sessions WHERE datetime(expires_at) > datetime('now')) AS activeSessions,
            (SELECT COUNT(*) FROM user_game_results WHERE datetime(completed_at) >= datetime('now', '-24 hours')) AS gamesLast24h,
            (SELECT COUNT(*) FROM user_daily_attempts WHERE daily_date = ?) AS dailyAttemptsToday,
            (SELECT COUNT(*) FROM user_weekly_attempts WHERE week_key = ?) AS weeklyAttemptsCurrent
    `);
    const trendStatement = database.prepare(`
        WITH RECURSIVE days(day, step) AS (
            SELECT date(?, '-6 days'), 0
            UNION ALL
            SELECT date(day, '+1 day'), step + 1 FROM days WHERE step < 6
        )
        SELECT
            day AS date,
            (SELECT COUNT(*) FROM users WHERE date(created_at) = day) AS usersCreated,
            (SELECT COUNT(*) FROM user_game_results WHERE date(completed_at) = day) AS gamesCompleted,
            (SELECT COUNT(*) FROM user_daily_attempts WHERE daily_date = day) AS dailyAttempts,
            (SELECT COUNT(*) FROM user_weekly_attempts WHERE date(started_at) = day) AS weeklyAttempts
        FROM days
        ORDER BY day
    `);
    const auditInsert = database.prepare(`
        INSERT INTO admin_audit_log (
            admin_user_id, action, target_type, target_id, details_json, request_id
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    async function getOverview({ weekKey, todayKey }) {
        return {
            ...(overviewStatement.get(todayKey, weekKey) || {}),
            activityTrend: trendStatement.all(todayKey)
        };
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
                users.account_uuid AS accountUuid,
                users.username,
                users.email,
                users.created_at AS createdAt,
                users.last_seen_at AS lastSeenAt,
                users.account_status AS accountStatus,
                users.suspended_until AS suspendedUntil,
                users.suspension_reason AS suspensionReason,
                users.suspended_at AS suspendedAt,
                CASE
                    WHEN users.account_status = 'suspended' AND (users.suspended_until IS NULL OR datetime(users.suspended_until) > datetime('now')) THEN 'suspended'
                    ELSE 'active'
                END AS effectiveStatus,
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

    async function getUserDetails(userId) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId) return null;
        const user = database.prepare(`
            SELECT
                users.id,
                users.account_uuid AS accountUuid,
                users.username,
                users.email,
                users.created_at AS createdAt,
                users.last_seen_at AS lastSeenAt,
                users.account_status AS accountStatus,
                users.suspended_until AS suspendedUntil,
                users.suspension_reason AS suspensionReason,
                users.suspended_at AS suspendedAt,
                CASE
                    WHEN users.account_status = 'suspended' AND (users.suspended_until IS NULL OR datetime(users.suspended_until) > datetime('now')) THEN 'suspended'
                    ELSE 'active'
                END AS effectiveStatus,
                COALESCE(user_progress.total_xp, 0) AS totalXp,
                COALESCE((SELECT COUNT(*) FROM sessions WHERE user_id = users.id AND datetime(expires_at) > datetime('now')), 0) AS activeSessions
            FROM users
            LEFT JOIN user_progress ON user_progress.user_id = users.id
            WHERE users.id = ?
        `).get(normalizedUserId);
        if (!user) return null;
        const stats = database.prepare(`
            SELECT
                mode,
                games_played AS gamesPlayed,
                games_won AS gamesWon,
                games_drawn AS gamesDrawn,
                current_streak AS currentStreak,
                best_streak AS bestStreak,
                guess_1 AS guess1, guess_2 AS guess2, guess_3 AS guess3,
                guess_4 AS guess4, guess_5 AS guess5, guess_6 AS guess6
            FROM user_game_stats WHERE user_id = ? ORDER BY mode
        `).all(normalizedUserId);
        const recentResults = database.prepare(`
            SELECT
                mode, outcome, attempts, difficulty,
                target_driver_name AS targetDriverName,
                duration_ms AS durationMs,
                opponent_username AS opponentUsername,
                completed_at AS completedAt
            FROM user_game_results
            WHERE user_id = ?
            ORDER BY datetime(completed_at) DESC, id DESC
            LIMIT 20
        `).all(normalizedUserId);
        const dailyAttempts = database.prepare(`
            SELECT challenge_id AS challengeId, daily_date AS dailyDate, difficulty, started_at AS startedAt
            FROM user_daily_attempts
            WHERE user_id = ?
            ORDER BY daily_date DESC, difficulty
            LIMIT 15
        `).all(normalizedUserId);
        const weeklyAttempts = database.prepare(`
            SELECT
                week_key AS weekKey, challenge_id AS challengeId, difficulty, score,
                rounds_completed AS roundsCompleted, rounds_played AS roundsPlayed,
                finish_reason AS finishReason, started_at AS startedAt, finished_at AS finishedAt
            FROM user_weekly_attempts
            WHERE user_id = ?
            ORDER BY week_key DESC
            LIMIT 10
        `).all(normalizedUserId);
        return normalizeUserDetails({ user, stats, recentResults, dailyAttempts, weeklyAttempts });
    }

    async function setUserSuspension({ userId, reason, suspendedUntil }) {
        const result = database.prepare(`
            UPDATE users
            SET account_status = 'suspended', suspended_until = ?, suspension_reason = ?, suspended_at = datetime('now')
            WHERE id = ?
        `).run(suspendedUntil, reason, userId);
        if (result.changes !== 1) return null;
        return database.prepare(`
            SELECT id, username, suspended_until AS suspendedUntil, suspension_reason AS suspensionReason
            FROM users WHERE id = ?
        `).get(userId) || null;
    }

    async function clearUserSuspension(userId) {
        const result = database.prepare(`
            UPDATE users
            SET account_status = 'active', suspended_until = NULL, suspension_reason = NULL, suspended_at = NULL
            WHERE id = ?
        `).run(userId);
        if (result.changes !== 1) return null;
        return database.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) || null;
    }

    async function resetDailyAttempts({ userId, dailyDate }) {
        return Number(database.prepare(
            'DELETE FROM user_daily_attempts WHERE user_id = ? AND daily_date = ?'
        ).run(userId, dailyDate).changes) || 0;
    }

    async function resetWeeklyAttempt({ userId, weekKey }) {
        return Number(database.prepare(
            'DELETE FROM user_weekly_attempts WHERE user_id = ? AND week_key = ?'
        ).run(userId, weekKey).changes) || 0;
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

    async function listAudit({ limit = 50, offset = 0, action, search } = {}) {
        const pageLimit = normalizeLimit(limit, 50, 100);
        const pageOffset = normalizeOffset(offset);
        const cleanAction = normalizeSearch(action, 80);
        const cleanSearch = normalizeSearch(search);
        const conditions = [];
        const params = [];
        if (cleanAction) {
            conditions.push('audit.action LIKE ? COLLATE NOCASE');
            params.push(`${cleanAction}%`);
        }
        if (cleanSearch) {
            conditions.push(`(
                audit.action LIKE ? COLLATE NOCASE
                OR COALESCE(audit.target_id, '') LIKE ? COLLATE NOCASE
                OR users.username LIKE ? COLLATE NOCASE
                OR audit.details_json LIKE ? COLLATE NOCASE
            )`);
            const pattern = `%${cleanSearch}%`;
            params.push(pattern, pattern, pattern, pattern);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = database.prepare(`
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
            ${where}
            ORDER BY datetime(audit.created_at) DESC, audit.id DESC
            LIMIT ? OFFSET ?
        `).all(...params, pageLimit, pageOffset);
        const total = Number(database.prepare(`
            SELECT COUNT(*) AS total
            FROM admin_audit_log audit
            JOIN users ON users.id = audit.admin_user_id
            ${where}
        `).get(...params)?.total) || 0;
        return {
            entries: rows.map(row => ({ ...row, details: parseAuditDetails(row.details) })),
            total,
            limit: pageLimit,
            offset: pageOffset
        };
    }

    return {
        getOverview,
        listUsers,
        getUserDetails,
        setUserSuspension,
        clearUserSuspension,
        resetDailyAttempts,
        resetWeeklyAttempt,
        recordAudit,
        listAudit
    };
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
    normalizeSearch,
    normalizeUserId
};
