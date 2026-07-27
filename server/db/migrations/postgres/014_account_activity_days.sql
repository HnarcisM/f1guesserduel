ALTER TABLE user_progress
    ADD COLUMN IF NOT EXISTS active_days INTEGER NOT NULL DEFAULT 0 CHECK (active_days >= 0),
    ADD COLUMN IF NOT EXISTS last_active_date DATE;

INSERT INTO user_progress (
    user_id,
    total_xp,
    active_days,
    last_active_date,
    updated_at
)
SELECT
    user_id,
    0,
    COUNT(DISTINCT ((completed_at AT TIME ZONE 'UTC')::date))::int,
    MAX((completed_at AT TIME ZONE 'UTC')::date),
    now()
FROM user_game_results
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
    active_days = GREATEST(user_progress.active_days, EXCLUDED.active_days),
    last_active_date = GREATEST(
        COALESCE(user_progress.last_active_date, EXCLUDED.last_active_date),
        EXCLUDED.last_active_date
    ),
    updated_at = now();
