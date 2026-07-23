CREATE INDEX IF NOT EXISTS idx_user_game_results_completed_at
    ON user_game_results(completed_at ASC);
