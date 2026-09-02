-- SATUSEHAT Control Plane - initial schema
-- Khanza remains the source of truth. This database stores integration state only.

CREATE TABLE IF NOT EXISTS integration_resource (
    id BIGSERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,
    source_system VARCHAR(50) NOT NULL DEFAULT 'KHANZA',
    source_table VARCHAR(100),
    source_key VARCHAR(255) NOT NULL,
    no_rawat VARCHAR(50),
    no_rkm_medis VARCHAR(30),
    satusehat_id VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'DISCOVERED',
    attempt_count INT NOT NULL DEFAULT 0,
    http_status INT,
    error_code VARCHAR(100),
    error_message TEXT,
    payload_hash VARCHAR(128),
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at TIMESTAMP,
    last_success_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_integration_resource UNIQUE (resource_type, source_system, source_key)
);

CREATE INDEX IF NOT EXISTS idx_resource_status ON integration_resource(status);
CREATE INDEX IF NOT EXISTS idx_resource_type_status ON integration_resource(resource_type, status);
CREATE INDEX IF NOT EXISTS idx_resource_no_rawat ON integration_resource(no_rawat);
CREATE INDEX IF NOT EXISTS idx_resource_no_rm ON integration_resource(no_rkm_medis);
CREATE INDEX IF NOT EXISTS idx_resource_satusehat_id ON integration_resource(satusehat_id);

CREATE TABLE IF NOT EXISTS integration_dependency (
    id BIGSERIAL PRIMARY KEY,
    resource_id BIGINT NOT NULL REFERENCES integration_resource(id) ON DELETE CASCADE,
    depends_on_resource_id BIGINT NOT NULL REFERENCES integration_resource(id) ON DELETE CASCADE,
    dependency_type VARCHAR(30) NOT NULL DEFAULT 'REQUIRED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dependency UNIQUE (resource_id, depends_on_resource_id),
    CONSTRAINT chk_no_self_dependency CHECK (resource_id <> depends_on_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_dependency_resource ON integration_dependency(resource_id);
CREATE INDEX IF NOT EXISTS idx_dependency_parent ON integration_dependency(depends_on_resource_id);

CREATE TABLE IF NOT EXISTS integration_payload (
    id BIGSERIAL PRIMARY KEY,
    resource_id BIGINT NOT NULL REFERENCES integration_resource(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    http_status INT,
    response JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payload_direction CHECK (direction IN ('OUTBOUND', 'INBOUND'))
);

CREATE INDEX IF NOT EXISTS idx_payload_resource ON integration_payload(resource_id);

CREATE TABLE IF NOT EXISTS integration_mapping (
    id BIGSERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,
    source_code VARCHAR(255) NOT NULL,
    source_name VARCHAR(255),
    satusehat_id VARCHAR(100),
    satusehat_code VARCHAR(255),
    satusehat_display VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_mapping UNIQUE (resource_type, source_code)
);

CREATE TABLE IF NOT EXISTS integration_job (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL UNIQUE,
    resource_type VARCHAR(50),
    schedule VARCHAR(100),
    batch_size INT NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integration_error (
    id BIGSERIAL PRIMARY KEY,
    resource_id BIGINT NOT NULL REFERENCES integration_resource(id) ON DELETE CASCADE,
    attempt_no INT,
    error_code VARCHAR(100),
    error_message TEXT,
    http_status INT,
    response JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_error_resource ON integration_error(resource_id);
CREATE INDEX IF NOT EXISTS idx_error_created ON integration_error(created_at);

CREATE TABLE IF NOT EXISTS integration_log (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    component VARCHAR(100),
    resource_id BIGINT REFERENCES integration_resource(id) ON DELETE SET NULL,
    message TEXT,
    context JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_log_created ON integration_log(created_at);
CREATE INDEX IF NOT EXISTS idx_log_level ON integration_log(level);

CREATE TABLE IF NOT EXISTS integration_cursor (
    id BIGSERIAL PRIMARY KEY,
    source_system VARCHAR(50) NOT NULL DEFAULT 'KHANZA',
    source_table VARCHAR(100) NOT NULL,
    cursor_value VARCHAR(255),
    last_sync_at TIMESTAMP,
    records_processed BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cursor UNIQUE (source_system, source_table)
);

-- Initial jobs: disabled until connector configuration is supplied.
INSERT INTO integration_job (job_name, resource_type, schedule, batch_size, enabled)
VALUES
 ('sync_patient', 'Patient', '*/5 * * * *', 100, FALSE),
 ('sync_practitioner', 'Practitioner', '*/30 * * * *', 100, FALSE),
 ('sync_organization', 'Organization', '0 * * * *', 100, FALSE),
 ('sync_location', 'Location', '0 * * * *', 100, FALSE),
 ('sync_encounter', 'Encounter', '*/2 * * * *', 100, FALSE),
 ('retry_failed', NULL, '*/10 * * * *', 100, FALSE)
ON CONFLICT (job_name) DO NOTHING;
