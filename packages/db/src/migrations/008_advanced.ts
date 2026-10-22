export const migration008 = `-- LedgerDesk schema v8 — Forex, GST history, fixed assets extras, printing & session (Phases 5 & 8)
PRAGMA foreign_keys = ON;

-- Currency exchange rates (master prompt §4.1)
CREATE TABLE IF NOT EXISTS exchange_rate (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currency(id) ON DELETE CASCADE,
  rate_date TEXT NOT NULL, -- YYYY-MM-DD
  rate_type TEXT NOT NULL DEFAULT 'Standard'
    CHECK (rate_type IN ('Standard', 'Selling', 'Buying')),
  -- Base-currency minor units per one unit of foreign currency
  rate INTEGER NOT NULL CHECK (rate > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, currency_id, rate_date, rate_type)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_lookup
  ON exchange_rate(company_id, currency_id, rate_date);

-- Historical GST rates for stock items (master prompt §4.2)
CREATE TABLE IF NOT EXISTS stock_item_gst_history (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  applicable_from TEXT NOT NULL, -- YYYY-MM-DD
  gst_taxability TEXT NOT NULL DEFAULT 'Taxable'
    CHECK (gst_taxability IN ('Taxable', 'Exempt', 'Nil Rated', 'Non-GST')),
  gst_rate REAL NOT NULL DEFAULT 0,
  cess_rate REAL NOT NULL DEFAULT 0,
  hsn_sac TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, stock_item_id, applicable_from)
);

CREATE INDEX IF NOT EXISTS idx_stock_gst_history
  ON stock_item_gst_history(company_id, stock_item_id, applicable_from);

-- Per-voucher currency (forex) — records the transaction-date rate applied
CREATE TABLE IF NOT EXISTS voucher_currency (
  voucher_id TEXT NOT NULL PRIMARY KEY REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  currency_id TEXT NOT NULL REFERENCES currency(id),
  exchange_rate INTEGER NOT NULL DEFAULT 0,
  rate_date TEXT NOT NULL
);

-- Print templates (HTML/CSS with placeholders) — master prompt §8
CREATE TABLE IF NOT EXISTS print_template (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'Invoice'
    CHECK (template_type IN (
      'Invoice', 'Quotation', 'Challan', 'Receipt', 'Payment Advice', 'Cheque',
      'Ledger Statement', 'Balance Confirmation', 'Reminder Letter', 'Delivery Note',
      'Purchase Order', 'Pay Slip', 'Journal', 'Contra', 'Purchase', 'Receipt Note',
      'Stock Journal', 'Voucher'
    )),
  paper_size TEXT NOT NULL DEFAULT 'A4'
    CHECK (paper_size IN ('A4', 'A5', 'Thermal80', 'Letter')),
  copies INTEGER NOT NULL DEFAULT 1,
  body_html TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

-- Audit of verified vouchers and lock dates — master prompt §12
CREATE TABLE IF NOT EXISTS voucher_verification (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  verified_by TEXT,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (voucher_id)
);

CREATE TABLE IF NOT EXISTS lock_date (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  lock_from TEXT NOT NULL, -- YYYY-MM-DD
  lock_to TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cash / funds flow working — master prompt §7.1
CREATE TABLE IF NOT EXISTS report_cache (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  report_key TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, report_key, as_of_date)
);

-- Stock valuation layers, materialised so a closing value is reproducible
-- without re-running the whole movement history.
CREATE TABLE IF NOT EXISTS stock_valuation_snapshot (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  as_of_date TEXT NOT NULL,
  costing_method TEXT NOT NULL,
  closing_quantity REAL NOT NULL DEFAULT 0,
  closing_value INTEGER NOT NULL DEFAULT 0,
  average_rate INTEGER NOT NULL DEFAULT 0,
  layers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, stock_item_id, as_of_date)
);

-- An interest rule applies to one ledger, so the sense of that ledger's
-- balance (receivable or payable) decides how the accrual is booked.
ALTER TABLE interest_rule ADD COLUMN is_receivable INTEGER NOT NULL DEFAULT 1;
` as const;
