CREATE TABLE IF NOT EXISTS user_weekly_attempts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_key VARCHAR(8) NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
    challenge_id VARCHAR(200) NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    score INTEGER CHECK (score IS NULL OR score >= 0),
    rounds_completed INTEGER CHECK (rounds_completed IS NULL OR rounds_completed BETWEEN 0 AND 5),
    rounds_played INTEGER CHECK (rounds_played IS NULL OR rounds_played BETWEEN 0 AND 5),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    finish_reason VARCHAR(40),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    CHECK (rounds_completed IS NULL OR rounds_played IS NULL OR rounds_completed <= rounds_played),
    PRIMARY KEY (user_id, week_key),
    UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_attempts_user_started
    ON user_weekly_attempts(user_id, started_at DESC);
