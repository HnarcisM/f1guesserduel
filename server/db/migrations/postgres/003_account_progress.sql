CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp BIGINT NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO user_progress (user_id, total_xp, updated_at)
SELECT
    user_id,
    SUM(
        10
        + CASE outcome WHEN 'win' THEN 40 WHEN 'draw' THEN 20 ELSE 0 END
        + CASE difficulty WHEN 'medium' THEN 5 WHEN 'hard' THEN 10 ELSE 0 END
        + CASE mode WHEN 'daily' THEN 10 WHEN 'duel' THEN 5 ELSE 0 END
    ),
    now()
FROM user_game_results
GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;
