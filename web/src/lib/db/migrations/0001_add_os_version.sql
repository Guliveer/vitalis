-- ============================================================
-- Migration: Add OS version info to machines
-- ============================================================
-- Adds os_version and os_name columns to the machines table
-- to store detailed OS information reported by the agent.
-- Examples:
--   os_name: "macOS Sonoma", "Ubuntu 22.04.3 LTS", "Microsoft Windows 11 Pro"
--   os_version: "14.2.1", "22.04", "10.0.22631"
-- ============================================================

ALTER TABLE machines ADD COLUMN IF NOT EXISTS os_version VARCHAR(100);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS os_name VARCHAR(100);
