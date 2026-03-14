-- Add invite-based signup and password reset support

-- Invite token for first-time password setup
ALTER TABLE employees ADD COLUMN invite_token VARCHAR(64);
ALTER TABLE employees ADD COLUMN invite_expires_at TIMESTAMPTZ;

-- Track whether employee has completed signup (set their own password)
ALTER TABLE employees ADD COLUMN has_set_password BOOLEAN DEFAULT FALSE;

-- Index for fast token lookup
CREATE INDEX idx_employees_invite_token ON employees(invite_token);

-- Mark all existing employees as having set their password
-- (they either use seed passwords or have already changed them)
UPDATE employees SET has_set_password = TRUE WHERE password_hash IS NOT NULL;
