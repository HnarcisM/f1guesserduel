CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_uuid TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
    suspended_until TEXT,
    suspension_reason TEXT,
    suspended_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_uuid
    ON users(account_uuid);
CREATE INDEX IF NOT EXISTS idx_users_account_status
    ON users(account_status, suspended_until);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    avatar_key TEXT NOT NULL DEFAULT 'helmet-red' CHECK (avatar_key IN (
        'helmet-red', 'helmet-blue', 'helmet-yellow', 'helmet-green',
        'helmet-orange', 'helmet-purple', 'helmet-cyan', 'helmet-white'
    )),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS username_change_limits (
    user_id INTEGER PRIMARY KEY,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_game_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('single', 'daily', 'duel')),
    result_key TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
    attempts INTEGER NOT NULL CHECK (attempts BETWEEN 0 AND 6),
    difficulty TEXT,
    target_driver_id TEXT,
    target_driver_name TEXT,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    room_id TEXT,
    match_id TEXT,
    opponent_username TEXT,
    winner_username TEXT,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, mode, result_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_game_results_user_completed
    ON user_game_results(user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_game_results_completed_at
    ON user_game_results(completed_at ASC);

CREATE TABLE IF NOT EXISTS user_daily_attempts (
    user_id INTEGER NOT NULL,
    challenge_id TEXT NOT NULL,
    daily_date TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, challenge_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_daily_attempts_user_date
    ON user_daily_attempts(user_id, daily_date);

CREATE TABLE IF NOT EXISTS user_weekly_attempts (
    user_id INTEGER NOT NULL,
    week_key TEXT NOT NULL CHECK (week_key GLOB '[0-9][0-9][0-9][0-9]-W[0-9][0-9]'),
    challenge_id TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    score INTEGER CHECK (score IS NULL OR score >= 0),
    rounds_completed INTEGER CHECK (rounds_completed IS NULL OR rounds_completed BETWEEN 0 AND 5),
    rounds_played INTEGER CHECK (rounds_played IS NULL OR rounds_played BETWEEN 0 AND 5),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    finish_reason TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    CHECK (rounds_completed IS NULL OR rounds_played IS NULL OR rounds_completed <= rounds_played),
    PRIMARY KEY (user_id, week_key),
    UNIQUE (user_id, challenge_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_attempts_user_started
    ON user_weekly_attempts(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS user_game_stats (
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('single', 'daily', 'duel')),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
    games_drawn INTEGER NOT NULL DEFAULT 0 CHECK (games_drawn >= 0),
    current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
    guess_1 INTEGER NOT NULL DEFAULT 0 CHECK (guess_1 >= 0),
    guess_2 INTEGER NOT NULL DEFAULT 0 CHECK (guess_2 >= 0),
    guess_3 INTEGER NOT NULL DEFAULT 0 CHECK (guess_3 >= 0),
    guess_4 INTEGER NOT NULL DEFAULT 0 CHECK (guess_4 >= 0),
    guess_5 INTEGER NOT NULL DEFAULT 0 CHECK (guess_5 >= 0),
    guess_6 INTEGER NOT NULL DEFAULT 0 CHECK (guess_6 >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, mode),
    CHECK (games_won + games_drawn <= games_played),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER PRIMARY KEY,
    total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    active_days INTEGER NOT NULL DEFAULT 0 CHECK (active_days >= 0),
    last_active_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    request_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
    ON admin_audit_log(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
    ON admin_audit_log(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
    ON users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_daily_attempts_date
    ON user_daily_attempts(daily_date);
CREATE INDEX IF NOT EXISTS idx_user_weekly_attempts_week
    ON user_weekly_attempts(week_key);

CREATE TABLE IF NOT EXISTS app_runtime_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_suspension_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    admin_user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('suspended', 'reactivated')),
    duration_key TEXT,
    reason TEXT,
    suspended_until TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_suspension_history_user
    ON user_suspension_history(user_id, created_at DESC, id DESC);
