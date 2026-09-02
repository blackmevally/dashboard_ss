-- Queue engine fields for safe retry/claim processing.
ALTER TABLE integration_resource
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_resource_queue_ready
    ON integration_resource(status, next_retry_at, id);

CREATE INDEX IF NOT EXISTS idx_resource_lock
    ON integration_resource(locked_at);
