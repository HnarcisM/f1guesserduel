ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_uuid UUID;

UPDATE users
SET account_uuid = gen_random_uuid()
WHERE account_uuid IS NULL;

ALTER TABLE users
    ALTER COLUMN account_uuid SET DEFAULT gen_random_uuid(),
    ALTER COLUMN account_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_uuid
    ON users(account_uuid);
