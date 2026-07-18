const MODE_COLUMNS = Object.freeze([
    'games_played',
    'games_won',
    'games_drawn',
    'current_streak',
    'best_streak',
    'guess_1',
    'guess_2',
    'guess_3',
    'guess_4',
    'guess_5',
    'guess_6'
]);

const SELECT_STATS_SQL = `
    SELECT mode, ${MODE_COLUMNS.join(', ')}
    FROM user_game_stats
    WHERE user_id = $1
    ORDER BY mode
`;

const SELECT_RECENT_RESULTS_SQL = `
    SELECT mode, outcome, attempts, difficulty, completed_at AS "completedAt"
    FROM user_game_results
    WHERE user_id = $1
    ORDER BY completed_at DESC, id DESC
    LIMIT $2
`;

const POSTGRES_UPSERT_STATS_SQL = `
    INSERT INTO user_game_stats (
        user_id, mode, games_played, games_won, games_drawn,
        current_streak, best_streak,
        guess_1, guess_2, guess_3, guess_4, guess_5, guess_6, updated_at
    )
    VALUES ($1, $2, 1, $3, $4, $3, $3, $5, $6, $7, $8, $9, $10, now())
    ON CONFLICT (user_id, mode) DO UPDATE SET
        games_played = user_game_stats.games_played + 1,
        games_won = user_game_stats.games_won + EXCLUDED.games_won,
        games_drawn = user_game_stats.games_drawn + EXCLUDED.games_drawn,
        current_streak = CASE
            WHEN EXCLUDED.games_won = 1 THEN user_game_stats.current_streak + 1
            ELSE 0
        END,
        best_streak = GREATEST(
            user_game_stats.best_streak,
            CASE
                WHEN EXCLUDED.games_won = 1 THEN user_game_stats.current_streak + 1
                ELSE user_game_stats.best_streak
            END
        ),
        guess_1 = user_game_stats.guess_1 + EXCLUDED.guess_1,
        guess_2 = user_game_stats.guess_2 + EXCLUDED.guess_2,
        guess_3 = user_game_stats.guess_3 + EXCLUDED.guess_3,
        guess_4 = user_game_stats.guess_4 + EXCLUDED.guess_4,
        guess_5 = user_game_stats.guess_5 + EXCLUDED.guess_5,
        guess_6 = user_game_stats.guess_6 + EXCLUDED.guess_6,
        updated_at = now()
`;

function buildResultIncrements(outcome, attempts) {
    const isWin = outcome === 'win';
    return {
        won: isWin ? 1 : 0,
        drawn: outcome === 'draw' ? 1 : 0,
        guesses: Array.from({ length: 6 }, (_, index) => isWin && attempts === index + 1 ? 1 : 0)
    };
}

function createPostgresAccountStatsRepository(database) {
    async function getStatsRows(userId, queryable = database) {
        const result = await queryable.query(SELECT_STATS_SQL, [userId]);
        return result.rows || [];
    }

    async function getRecentResults(userId, limit = 10, queryable = database) {
        const result = await queryable.query(SELECT_RECENT_RESULTS_SQL, [userId, limit]);
        return result.rows || [];
    }

    async function recordGameResult(result) {
        const client = await database.pool.connect();
        const increments = buildResultIncrements(result.outcome, result.attempts);
        let transactionStarted = false;

        try {
            await client.query('BEGIN');
            transactionStarted = true;
            const insertResult = await client.query(`
                INSERT INTO user_game_results (
                    user_id, mode, result_key, outcome, attempts, difficulty
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id, mode, result_key) DO NOTHING
                RETURNING id
            `, [
                result.userId,
                result.mode,
                result.resultKey,
                result.outcome,
                result.attempts,
                result.difficulty
            ]);

            const recorded = insertResult.rowCount === 1;
            if (recorded) {
                await client.query(POSTGRES_UPSERT_STATS_SQL, [
                    result.userId,
                    result.mode,
                    increments.won,
                    increments.drawn,
                    ...increments.guesses
                ]);
            }

            const [rows, recentResults] = await Promise.all([
                getStatsRows(result.userId, client),
                getRecentResults(result.userId, 10, client)
            ]);
            await client.query('COMMIT');
            transactionStarted = false;
            return { recorded, rows, recentResults };
        } catch (error) {
            if (transactionStarted) await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    return {
        provider: 'postgres',
        getStatsRows,
        getRecentResults,
        recordGameResult
    };
}

function createSqliteAccountStatsRepository(database) {
    const selectStats = database.prepare(SELECT_STATS_SQL.replace('$1', '?'));
    const selectRecentResults = database.prepare(`
        SELECT mode, outcome, attempts, difficulty, completed_at AS completedAt
        FROM user_game_results
        WHERE user_id = ?
        ORDER BY completed_at DESC, id DESC
        LIMIT ?
    `);
    const insertResult = database.prepare(`
        INSERT OR IGNORE INTO user_game_results (
            user_id, mode, result_key, outcome, attempts, difficulty
        ) VALUES (@userId, @mode, @resultKey, @outcome, @attempts, @difficulty)
    `);
    const upsertStats = database.prepare(`
        INSERT INTO user_game_stats (
            user_id, mode, games_played, games_won, games_drawn,
            current_streak, best_streak,
            guess_1, guess_2, guess_3, guess_4, guess_5, guess_6, updated_at
        )
        VALUES (
            @userId, @mode, 1, @won, @drawn, @won, @won,
            @guess1, @guess2, @guess3, @guess4, @guess5, @guess6, datetime('now')
        )
        ON CONFLICT(user_id, mode) DO UPDATE SET
            games_played = games_played + 1,
            games_won = games_won + excluded.games_won,
            games_drawn = games_drawn + excluded.games_drawn,
            current_streak = CASE WHEN excluded.games_won = 1 THEN current_streak + 1 ELSE 0 END,
            best_streak = MAX(
                best_streak,
                CASE WHEN excluded.games_won = 1 THEN current_streak + 1 ELSE best_streak END
            ),
            guess_1 = guess_1 + excluded.guess_1,
            guess_2 = guess_2 + excluded.guess_2,
            guess_3 = guess_3 + excluded.guess_3,
            guess_4 = guess_4 + excluded.guess_4,
            guess_5 = guess_5 + excluded.guess_5,
            guess_6 = guess_6 + excluded.guess_6,
            updated_at = datetime('now')
    `);
    const recordTransaction = database.transaction(result => {
        const insert = insertResult.run(result);
        if (insert.changes !== 1) return false;

        const increments = buildResultIncrements(result.outcome, result.attempts);
        upsertStats.run({
            userId: result.userId,
            mode: result.mode,
            won: increments.won,
            drawn: increments.drawn,
            guess1: increments.guesses[0],
            guess2: increments.guesses[1],
            guess3: increments.guesses[2],
            guess4: increments.guesses[3],
            guess5: increments.guesses[4],
            guess6: increments.guesses[5]
        });
        return true;
    });

    async function getStatsRows(userId) {
        return selectStats.all(userId);
    }

    async function getRecentResults(userId, limit = 10) {
        return selectRecentResults.all(userId, limit);
    }

    async function recordGameResult(result) {
        const recorded = recordTransaction(result);
        return {
            recorded,
            rows: await getStatsRows(result.userId),
            recentResults: await getRecentResults(result.userId)
        };
    }

    return {
        provider: 'sqlite',
        getStatsRows,
        getRecentResults,
        recordGameResult
    };
}

function createAccountStatsRepository(databaseOrRepository) {
    if (databaseOrRepository?.getStatsRows && databaseOrRepository?.recordGameResult) {
        return databaseOrRepository;
    }
    if (databaseOrRepository?.provider === 'postgres' || databaseOrRepository?.pool) {
        return createPostgresAccountStatsRepository(databaseOrRepository);
    }
    if (typeof databaseOrRepository?.prepare === 'function') {
        return createSqliteAccountStatsRepository(databaseOrRepository);
    }
    throw new Error('Unsupported database adapter for account statistics.');
}

module.exports = {
    MODE_COLUMNS,
    SELECT_RECENT_RESULTS_SQL,
    buildResultIncrements,
    createAccountStatsRepository,
    createPostgresAccountStatsRepository,
    createSqliteAccountStatsRepository
};
