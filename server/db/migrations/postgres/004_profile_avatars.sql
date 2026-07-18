CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_key TEXT NOT NULL DEFAULT 'helmet-red',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (avatar_key IN (
        'helmet-red',
        'helmet-blue',
        'helmet-yellow',
        'helmet-green',
        'helmet-orange',
        'helmet-purple',
        'helmet-cyan',
        'helmet-white'
    ))
);
