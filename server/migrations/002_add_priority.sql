-- Add priority column to requests (1-9, only used for vacation requests)
ALTER TABLE requests ADD COLUMN priority INT;

-- Add constraint: priority must be 1-9 when set
ALTER TABLE requests ADD CONSTRAINT chk_priority CHECK (priority IS NULL OR (priority >= 1 AND priority <= 9));
