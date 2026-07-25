ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_account_status_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_account_status_check
            CHECK (account_status IN ('active', 'suspended'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_account_status
    ON users(account_status, suspended_until);
