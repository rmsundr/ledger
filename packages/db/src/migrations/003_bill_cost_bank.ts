export const migration003 = `-- LedgerDesk schema v3 — Bill-wise details, Cost Centres, Bank Allocations, Budgets, Interest (Phase 3)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bill_ref (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  party_ledger_id TEXT NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('New Ref', 'Agst Ref', 'Advance', 'On Account')),
  ref_name TEXT NOT NULL,
  voucher_id TEXT REFERENCES voucher(id) ON DELETE SET NULL,
  due_date TEXT,
  credit_period_days INTEGER,
  opening_amount INTEGER NOT NULL DEFAULT 0,
  is_debit INTEGER NOT NULL DEFAULT 1 CHECK (is_debit IN (0, 1)),
  is_settled INTEGER NOT NULL DEFAULT 0 CHECK (is_settled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, party_ledger_id, ref_name)
);

CREATE INDEX IF NOT EXISTS idx_bill_ref_party ON bill_ref(company_id, party_ledger_id);
CREATE INDEX IF NOT EXISTS idx_bill_ref_due ON bill_ref(company_id, due_date);

CREATE TABLE IF NOT EXISTS voucher_bill_allocation (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  voucher_ledger_entry_id TEXT NOT NULL REFERENCES voucher_ledger_entry(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  party_ledger_id TEXT NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('New Ref', 'Agst Ref', 'Advance', 'On Account')),
  ref_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  is_debit INTEGER NOT NULL CHECK (is_debit IN (0, 1)),
  due_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_vba_voucher ON voucher_bill_allocation(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vba_party_ref ON voucher_bill_allocation(company_id, party_ledger_id, ref_name);

CREATE TABLE IF NOT EXISTS cost_category (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allocate_revenue INTEGER NOT NULL DEFAULT 1 CHECK (allocate_revenue IN (0, 1)),
  allocate_non_revenue INTEGER NOT NULL DEFAULT 0 CHECK (allocate_non_revenue IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS cost_centre (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES cost_category(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES cost_centre(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, category_id, name)
);

CREATE TABLE IF NOT EXISTS voucher_cost_allocation (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  voucher_ledger_entry_id TEXT NOT NULL REFERENCES voucher_ledger_entry(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  cost_centre_id TEXT NOT NULL REFERENCES cost_centre(id),
  amount INTEGER NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS voucher_bank_allocation (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  voucher_ledger_entry_id TEXT NOT NULL REFERENCES voucher_ledger_entry(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  bank_ledger_id TEXT NOT NULL REFERENCES ledger(id),
  transaction_type TEXT NOT NULL DEFAULT 'Cheque'
    CHECK (transaction_type IN ('Cheque', 'DD', 'ECS', 'NEFT', 'RTGS', 'UPI', 'Others')),
  instrument_no TEXT NOT NULL DEFAULT '',
  instrument_date TEXT,
  bank_name TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount >= 0),
  cheque_status TEXT NOT NULL DEFAULT 'Uncleared'
    CHECK (cheque_status IN ('Uncleared', 'Cleared', 'Bounced')),
  bank_date TEXT, -- BRS clearance date
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vba_bank ON voucher_bank_allocation(company_id, bank_ledger_id, bank_date);

CREATE TABLE IF NOT EXISTS budget (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS budget_line (
  id TEXT NOT NULL PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  ledger_id TEXT REFERENCES ledger(id),
  group_id TEXT REFERENCES "group"(id),
  cost_centre_id TEXT REFERENCES cost_centre(id),
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interest_rule (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  ledger_id TEXT NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  rate_percent REAL NOT NULL,
  interest_style TEXT NOT NULL DEFAULT '365-day Year'
    CHECK (interest_style IN ('365-day Year', '360-day Year', 'Calendar Month', 'Calendar Year')),
  calculate_from TEXT NOT NULL DEFAULT 'Voucher Date'
    CHECK (calculate_from IN ('Voucher Date', 'Due Date')),
  grace_days INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, ledger_id)
);
` as const;
