-- ============================================================
-- Vitalis — Initial Database Migration
-- ============================================================
-- Creates all tables, indexes, and constraints for the
-- system monitoring platform. Designed for Neon PostgreSQL 13+.
-- ============================================================

-- ============================================================
-- USERS
-- Stores registered user accounts with hashed passwords.
-- The first registered user is automatically assigned ADMIN role.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'USER'
                    CHECK (role IN ('ADMIN', 'USER')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============================================================
-- MACHINES
-- Represents monitored machines registered by users.
-- Each machine has a unique token used by the Go agent for
-- authentication during metric ingestion.
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    machine_token   VARCHAR(255) NOT NULL UNIQUE,
    os              VARCHAR(50),
    arch            VARCHAR(50),
    last_seen       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_user_id ON machines (user_id);
CREATE INDEX IF NOT EXISTS idx_machines_token ON machines (machine_token);

-- ============================================================
-- MACHINE ACCESS (multi-user sharing)
-- Enables sharing machines between users with granular
-- permission levels (READ, WRITE, ADMIN).
-- ============================================================
CREATE TABLE IF NOT EXISTS machine_access (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission      VARCHAR(20) NOT NULL DEFAULT 'READ'
                    CHECK (permission IN ('READ', 'WRITE', 'ADMIN')),
    granted_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_machine_access_machine_user UNIQUE (machine_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_access_user ON machine_access (user_id);
CREATE INDEX IF NOT EXISTS idx_machine_access_machine ON machine_access (machine_id);

-- ============================================================
-- METRICS
-- Raw metric data points collected by Go agents.
-- Each row represents a single collection snapshot containing
-- CPU, RAM, disk, network, uptime, and temperature data.
-- JSONB columns store variable-structure data (per-core CPU,
-- per-disk usage) that varies by machine configuration.
-- ============================================================
CREATE TABLE IF NOT EXISTS metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    timestamp       TIMESTAMPTZ NOT NULL,
    cpu_overall     REAL,
    cpu_cores       JSONB,
    ram_used        BIGINT,
    ram_total       BIGINT,
    disk_usage      JSONB,
    network_rx      BIGINT,
    network_tx      BIGINT,
    uptime_seconds  INTEGER,
    cpu_temp        REAL,
    gpu_temp        REAL
);

-- Primary query pattern: metrics for machine X in time range Y, ordered by time DESC
CREATE INDEX IF NOT EXISTS idx_metrics_machine_time
    ON metrics (machine_id, timestamp DESC);

-- Cleanup: efficiently find and delete metrics older than retention period
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
    ON metrics (timestamp);

-- ============================================================
-- PROCESS SNAPSHOTS
-- Stores top-N process lists linked to metric snapshots.
-- Separated from metrics table because process data is large
-- (2-5KB per snapshot) and only needed for current-state view,
-- not time-series charts. Keeps metrics table rows smaller for
-- efficient time-range scans.
-- ============================================================
CREATE TABLE IF NOT EXISTS process_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id       UUID NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
    processes       JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_process_snapshots_metric
    ON process_snapshots (metric_id);

-- ============================================================
-- HOURLY AGGREGATES (30-day retention)
-- Pre-computed hourly rollups from raw metrics.
-- Used for 7-day and 30-day dashboard views to avoid
-- scanning millions of raw metric rows.
-- Populated by the cleanup/aggregation cron job.
-- ============================================================
CREATE TABLE IF NOT EXISTS metrics_hourly (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id          UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    hour                TIMESTAMPTZ NOT NULL,
    cpu_avg             REAL,
    cpu_max             REAL,
    ram_avg             BIGINT,
    ram_max             BIGINT,
    network_rx_total    BIGINT,
    network_tx_total    BIGINT,
    sample_count        INTEGER,
    CONSTRAINT uq_metrics_hourly_machine_hour UNIQUE (machine_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_machine_hour
    ON metrics_hourly (machine_id, hour DESC);

-- ============================================================
-- DAILY AGGREGATES (1-year retention)
-- Pre-computed daily rollups from hourly aggregates.
-- Used for 30-day+ dashboard views and long-term trends.
-- Populated by the cleanup/aggregation cron job.
-- ============================================================
CREATE TABLE IF NOT EXISTS metrics_daily (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id          UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    day                 DATE NOT NULL,
    cpu_avg             REAL,
    cpu_max             REAL,
    ram_avg             BIGINT,
    ram_max             BIGINT,
    network_rx_total    BIGINT,
    network_tx_total    BIGINT,
    sample_count        INTEGER,
    CONSTRAINT uq_metrics_daily_machine_day UNIQUE (machine_id, day)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_machine_day
    ON metrics_daily (machine_id, day DESC);
