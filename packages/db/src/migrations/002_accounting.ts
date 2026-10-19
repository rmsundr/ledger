export const migration002 = `-- LedgerDesk schema v2 — Accounting Masters & Vouchers (Phase 2)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS voucher (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  voucher_type_id TEXT NOT NULL REFERENCES voucher_type(id),
  voucher_type_name TEXT NOT NULL,
  voucher_number TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  effective_date TEXT, -- YYYY-MM-DD
  reference_no TEXT NOT NULL DEFAULT '',
  reference_date TEXT,
  narration TEXT NOT NULL DEFAULT '',
  is_invoice INTEGER NOT NULL DEFAULT 0 CHECK (is_invoice IN (0, 1)),
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1)),
  is_post_dated INTEGER NOT NULL DEFAULT 0 CHECK (is_post_dated IN (0, 1)),
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1)),
  total_amount INTEGER NOT NULL DEFAULT 0, -- Minor units (paise)
  guid TEXT,
  alter_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (company_id, voucher_type_id, voucher_number)
);

CREATE INDEX IF NOT EXISTS idx_voucher_company_date ON voucher(company_id, date);
CREATE INDEX IF NOT EXISTS idx_voucher_company_type ON voucher(company_id, voucher_type_id);
CREATE INDEX IF NOT EXISTS idx_voucher_guid ON voucher(company_id, guid);

CREATE TABLE IF NOT EXISTS voucher_ledger_entry (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  ledger_id TEXT NOT NULL REFERENCES ledger(id),
  entry_index INTEGER NOT NULL DEFAULT 0,
  is_debit INTEGER NOT NULL CHECK (is_debit IN (0, 1)),
  amount INTEGER NOT NULL CHECK (amount >= 0), -- Minor units (paise)
  narration TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vle_voucher ON voucher_ledger_entry(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vle_ledger ON voucher_ledger_entry(company_id, ledger_id);
CREATE INDEX IF NOT EXISTS idx_vle_ledger_date ON voucher_ledger_entry(company_id, ledger_id);

CREATE TABLE IF NOT EXISTS voucher_number_sequence (
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  voucher_type_id TEXT NOT NULL REFERENCES voucher_type(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL DEFAULT '', -- e.g. '2025' or '2025-04'
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, voucher_type_id, period_key)
);

CREATE TABLE IF NOT EXISTS voucher_class (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  voucher_type_id TEXT NOT NULL REFERENCES voucher_type(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_ledger_id TEXT REFERENCES ledger(id),
  percentage REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, voucher_type_id, name)
);

CREATE TABLE IF NOT EXISTS ledger_bank_details (
  ledger_id TEXT NOT NULL PRIMARY KEY REFERENCES ledger(id) ON DELETE CASCADE,
  account_no TEXT NOT NULL DEFAULT '',
  ifsc TEXT NOT NULL DEFAULT '',
  swift TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ledger_gst_details (
  ledger_id TEXT NOT NULL PRIMARY KEY REFERENCES ledger(id) ON DELETE CASCADE,
  duty_head TEXT NOT NULL DEFAULT 'Others' CHECK (duty_head IN ('CGST', 'SGST', 'IGST', 'Cess', 'Others')),
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_type TEXT NOT NULL DEFAULT 'GST'
);

CREATE TABLE IF NOT EXISTS ledger_tds_details (
  ledger_id TEXT NOT NULL PRIMARY KEY REFERENCES ledger(id) ON DELETE CASCADE,
  nature_of_payment TEXT NOT NULL DEFAULT '',
  deductee_type TEXT NOT NULL DEFAULT 'Company' CHECK (deductee_type IN ('Company', 'Individual/HUF', 'Others')),
  rate REAL NOT NULL DEFAULT 0
);
` as const;
