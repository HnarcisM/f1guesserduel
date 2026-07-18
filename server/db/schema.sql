CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
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
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, mode, result_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_game_results_user_completed
    ON user_game_results(user_id, completed_at DESC);

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
