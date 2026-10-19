export const migration007 = `-- LedgerDesk schema v7 — Tally Import Maps, Jobs & Report Configurations (Phase 7 & 8)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tally_import_job (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('XML_FILE', 'LIVE_SERVER', 'EXCEL', 'CSV', 'NATIVE_BACKUP')),
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
  total_records INTEGER NOT NULL DEFAULT 0,
  imported_records INTEGER NOT NULL DEFAULT 0,
  skipped_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  reconciliation_report_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tally_import_map (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  tally_guid TEXT NOT NULL,
  tally_remote_id TEXT,
  tally_name TEXT,
  local_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, entity_type, tally_guid)
);

CREATE INDEX IF NOT EXISTS idx_tally_map_guid ON tally_import_map(company_id, entity_type, tally_guid);

CREATE TABLE IF NOT EXISTS report_config (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  config_name TEXT NOT NULL DEFAULT 'Default',
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, report_type, config_name)
);
` as const;
