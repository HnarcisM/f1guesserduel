CREATE TABLE IF NOT EXISTS user_daily_attempts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id VARCHAR(200) NOT NULL,
    daily_date DATE NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_attempts_user_date
    ON user_daily_attempts(user_id, daily_date);
