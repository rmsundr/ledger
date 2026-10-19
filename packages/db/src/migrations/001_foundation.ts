export const migration001 = `-- LedgerDesk schema v1 — Foundation (Phase 1)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  mailing_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  address_line3 TEXT NOT NULL DEFAULT '',
  address_line4 TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'India',
  pin TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  financial_year_begin TEXT NOT NULL,
  books_begin TEXT NOT NULL,
  base_currency_symbol TEXT NOT NULL DEFAULT '₹',
  base_currency_formal_name TEXT NOT NULL DEFAULT 'Indian Rupee',
  base_currency_decimals INTEGER NOT NULL DEFAULT 2 CHECK (base_currency_decimals >= 0 AND base_currency_decimals <= 4),
  company_pan TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  cin TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  is_encrypted INTEGER NOT NULL DEFAULT 0 CHECK (is_encrypted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS company_features (
  company_id TEXT NOT NULL PRIMARY KEY REFERENCES company(id) ON DELETE CASCADE,
  maintain_accounts INTEGER NOT NULL DEFAULT 1,
  maintain_inventory INTEGER NOT NULL DEFAULT 1,
  integrate_accounts_inventory INTEGER NOT NULL DEFAULT 1,
  multiple_currencies INTEGER NOT NULL DEFAULT 0,
  bill_wise_details INTEGER NOT NULL DEFAULT 1,
  cost_centres INTEGER NOT NULL DEFAULT 0,
  interest_calculation INTEGER NOT NULL DEFAULT 0,
  budgets_and_controls INTEGER NOT NULL DEFAULT 0,
  payroll INTEGER NOT NULL DEFAULT 0,
  gst INTEGER NOT NULL DEFAULT 1,
  tds INTEGER NOT NULL DEFAULT 0,
  tcs INTEGER NOT NULL DEFAULT 0,
  vat_excise INTEGER NOT NULL DEFAULT 0,
  post_dated_cheques INTEGER NOT NULL DEFAULT 0,
  job_costing INTEGER NOT NULL DEFAULT 0,
  debit_credit_notes INTEGER NOT NULL DEFAULT 1,
  invoice_mode INTEGER NOT NULL DEFAULT 1,
  optional_vouchers INTEGER NOT NULL DEFAULT 1,
  memorandum_vouchers INTEGER NOT NULL DEFAULT 1,
  reversing_journals INTEGER NOT NULL DEFAULT 0,
  multiple_price_levels INTEGER NOT NULL DEFAULT 0,
  batches INTEGER NOT NULL DEFAULT 0,
  expiry_dates INTEGER NOT NULL DEFAULT 0,
  manufacturing_bom INTEGER NOT NULL DEFAULT 0,
  tracking_numbers INTEGER NOT NULL DEFAULT 0,
  order_processing INTEGER NOT NULL DEFAULT 0,
  purchase_sales_orders INTEGER NOT NULL DEFAULT 0,
  additional_cost_details INTEGER NOT NULL DEFAULT 0,
  actual_vs_billed_qty INTEGER NOT NULL DEFAULT 0,
  rejection_in_out INTEGER NOT NULL DEFAULT 0,
  zero_valued_transactions INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financial_year (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  begin_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  UNIQUE (company_id, begin_date)
);

CREATE TABLE IF NOT EXISTS role (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES role(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, username)
);

CREATE TABLE IF NOT EXISTS permission (
  id TEXT NOT NULL PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  UNIQUE (role_id, resource, action)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edit_log (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "group" (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES "group"(id),
  nature TEXT NOT NULL CHECK (nature IN ('Assets', 'Liabilities', 'Income', 'Expense')),
  is_system INTEGER NOT NULL DEFAULT 0,
  behaves_like_subledger INTEGER NOT NULL DEFAULT 0,
  nett_debit_credit INTEGER NOT NULL DEFAULT 1,
  used_for_calculation TEXT CHECK (used_for_calculation IN ('None', 'Purchase', 'Sales') OR used_for_calculation IS NULL),
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS currency (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  formal_name TEXT NOT NULL,
  decimal_places INTEGER NOT NULL DEFAULT 2,
  is_base INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, symbol)
);

CREATE TABLE IF NOT EXISTS voucher_type (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_name TEXT,
  numbering_method TEXT NOT NULL DEFAULT 'Automatic'
    CHECK (numbering_method IN ('Automatic', 'AutomaticManualOverride', 'Manual', 'None')),
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  restart_numbering TEXT NOT NULL DEFAULT 'Yearly'
    CHECK (restart_numbering IN ('Yearly', 'Monthly', 'Daily', 'Never')),
  prevent_duplicates INTEGER NOT NULL DEFAULT 1,
  use_effective_dates INTEGER NOT NULL DEFAULT 0,
  allow_zero_valued INTEGER NOT NULL DEFAULT 0,
  optional_by_default INTEGER NOT NULL DEFAULT 0,
  narration_per_ledger INTEGER NOT NULL DEFAULT 0,
  print_after_save INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  alias TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL REFERENCES "group"(id),
  opening_balance INTEGER NOT NULL DEFAULT 0,
  opening_is_debit INTEGER NOT NULL DEFAULT 1 CHECK (opening_is_debit IN (0, 1)),
  maintain_bill_by_bill INTEGER NOT NULL DEFAULT 0,
  default_credit_period_days INTEGER,
  inventory_values_affected INTEGER NOT NULL DEFAULT 0,
  cost_centres_applicable INTEGER NOT NULL DEFAULT 0,
  mailing_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  pin TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  pan TEXT NOT NULL DEFAULT '',
  gst_registration_type TEXT NOT NULL DEFAULT 'Unregistered',
  gstin TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ledger_group ON ledger(company_id, group_id);
CREATE INDEX IF NOT EXISTS idx_group_parent ON "group"(company_id, parent_id);

CREATE TABLE IF NOT EXISTS settings (
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (company_id, key)
);

CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS app_registry (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  db_path TEXT NOT NULL UNIQUE,
  mailing_name TEXT NOT NULL,
  financial_year_begin TEXT NOT NULL,
  books_begin TEXT NOT NULL,
  last_opened_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
` as const;
