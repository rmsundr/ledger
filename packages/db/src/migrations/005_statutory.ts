export const migration005 = `-- LedgerDesk schema v5 — Statutory: GST, TDS/TCS, Fixed Assets & Depreciation (Phase 5)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS voucher_gst_summary (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  place_of_supply TEXT NOT NULL DEFAULT '',
  is_inter_state INTEGER NOT NULL DEFAULT 0 CHECK (is_inter_state IN (0, 1)),
  is_rcm INTEGER NOT NULL DEFAULT 0 CHECK (is_rcm IN (0, 1)),
  taxable_value INTEGER NOT NULL DEFAULT 0,
  cgst_amount INTEGER NOT NULL DEFAULT 0,
  sgst_amount INTEGER NOT NULL DEFAULT 0,
  igst_amount INTEGER NOT NULL DEFAULT 0,
  cess_amount INTEGER NOT NULL DEFAULT 0,
  hsn_summary_json TEXT NOT NULL DEFAULT '[]',
  irn TEXT,
  ack_no TEXT,
  ack_date TEXT,
  qr_code TEXT,
  eway_bill_no TEXT,
  eway_bill_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gst_summary_voucher ON voucher_gst_summary(voucher_id);

CREATE TABLE IF NOT EXISTS voucher_tds_entry (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  party_ledger_id TEXT NOT NULL REFERENCES ledger(id),
  tds_ledger_id TEXT NOT NULL REFERENCES ledger(id),
  section TEXT NOT NULL,
  nature_of_payment TEXT NOT NULL,
  deductee_pan TEXT NOT NULL DEFAULT '',
  gross_amount INTEGER NOT NULL,
  rate REAL NOT NULL,
  tds_amount INTEGER NOT NULL,
  challan_no TEXT,
  bsr_code TEXT,
  deposit_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixed_asset (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_ledger_id TEXT NOT NULL REFERENCES ledger(id),
  accumulated_depr_ledger_id TEXT REFERENCES ledger(id),
  depr_expense_ledger_id TEXT REFERENCES ledger(id),
  purchase_date TEXT NOT NULL,
  purchase_cost INTEGER NOT NULL,
  wdv_block TEXT NOT NULL DEFAULT 'Plant & Machinery',
  it_act_rate REAL NOT NULL DEFAULT 15.0,
  companies_act_method TEXT NOT NULL DEFAULT 'SLM' CHECK (companies_act_method IN ('SLM', 'WDV')),
  useful_life_years REAL NOT NULL DEFAULT 5,
  salvage_value INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS depreciation_entry (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  fixed_asset_id TEXT NOT NULL REFERENCES fixed_asset(id) ON DELETE CASCADE,
  financial_year_id TEXT NOT NULL REFERENCES financial_year(id),
  date TEXT NOT NULL,
  it_depreciation INTEGER NOT NULL,
  companies_act_depreciation INTEGER NOT NULL,
  voucher_id TEXT REFERENCES voucher(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
` as const;
