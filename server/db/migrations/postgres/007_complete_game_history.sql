ALTER TABLE user_game_results
    ADD COLUMN IF NOT EXISTS target_driver_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS target_driver_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
    ADD COLUMN IF NOT EXISTS room_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS match_id VARCHAR(200),
    ADD COLUMN IF NOT EXISTS opponent_username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS winner_username VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_user_game_results_match
    ON user_game_results(match_id)
    WHERE match_id IS NOT NULL;
