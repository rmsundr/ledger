export const migration004 = `-- LedgerDesk schema v4 — Inventory Masters, Stock Ledger, BOM, Batches, Orders (Phase 4)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS unit (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  formal_name TEXT NOT NULL,
  decimal_places INTEGER NOT NULL DEFAULT 0 CHECK (decimal_places >= 0 AND decimal_places <= 4),
  is_compound INTEGER NOT NULL DEFAULT 0 CHECK (is_compound IN (0, 1)),
  base_unit_id TEXT REFERENCES unit(id),
  conversion_factor REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, symbol)
);

CREATE TABLE IF NOT EXISTS stock_group (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES stock_group(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS stock_category (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES stock_category(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS godown (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES godown(id),
  address TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS stock_item (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  alias TEXT NOT NULL DEFAULT '',
  part_no TEXT NOT NULL DEFAULT '',
  group_id TEXT REFERENCES stock_group(id),
  category_id TEXT REFERENCES stock_category(id),
  unit_id TEXT NOT NULL REFERENCES unit(id),
  alternate_unit_id TEXT REFERENCES unit(id),
  alt_conversion_numerator REAL,
  alt_conversion_denominator REAL,
  costing_method TEXT NOT NULL DEFAULT 'Avg Cost'
    CHECK (costing_method IN ('Avg Cost', 'FIFO', 'LIFO', 'Last Purchase Cost', 'Std Cost', 'Zero Cost')),
  market_valuation_method TEXT NOT NULL DEFAULT 'Avg Price',
  opening_quantity REAL NOT NULL DEFAULT 0,
  opening_rate INTEGER NOT NULL DEFAULT 0,
  opening_value INTEGER NOT NULL DEFAULT 0,
  opening_godown_id TEXT REFERENCES godown(id),
  maintain_batches INTEGER NOT NULL DEFAULT 0 CHECK (maintain_batches IN (0, 1)),
  track_manufacturing_date INTEGER NOT NULL DEFAULT 0 CHECK (track_manufacturing_date IN (0, 1)),
  track_expiry_date INTEGER NOT NULL DEFAULT 0 CHECK (track_expiry_date IN (0, 1)),
  reorder_level REAL,
  min_order_qty REAL,
  hsn_sac TEXT NOT NULL DEFAULT '',
  gst_taxability TEXT NOT NULL DEFAULT 'Taxable'
    CHECK (gst_taxability IN ('Taxable', 'Exempt', 'Nil Rated', 'Non-GST')),
  gst_rate REAL NOT NULL DEFAULT 0,
  cess_rate REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_stock_item_grp ON stock_item(company_id, group_id);

CREATE TABLE IF NOT EXISTS batch (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manufacturing_date TEXT,
  expiry_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, stock_item_id, name)
);

CREATE TABLE IF NOT EXISTS stock_item_bom (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_id TEXT NOT NULL REFERENCES unit(id),
  produced_qty REAL NOT NULL DEFAULT 1,
  components_json TEXT NOT NULL,
  by_products_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, stock_item_id, name)
);

CREATE TABLE IF NOT EXISTS voucher_inventory_entry (
  id TEXT NOT NULL PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id),
  godown_id TEXT REFERENCES godown(id),
  batch_id TEXT REFERENCES batch(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('Inward', 'Outward', 'Transfer_Source', 'Transfer_Dest')),
  quantity REAL NOT NULL CHECK (quantity >= 0),
  actual_quantity REAL,
  rate INTEGER NOT NULL CHECK (rate >= 0),
  discount_percent REAL NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  tracking_number TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL DEFAULT '',
  entry_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vie_voucher ON voucher_inventory_entry(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vie_item ON voucher_inventory_entry(company_id, stock_item_id);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  voucher_id TEXT REFERENCES voucher(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  godown_id TEXT REFERENCES godown(id),
  batch_id TEXT REFERENCES batch(id),
  inward_qty REAL NOT NULL DEFAULT 0,
  outward_qty REAL NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL DEFAULT 0,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON stock_ledger(company_id, stock_item_id, date);

CREATE TABLE IF NOT EXISTS price_list (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  applicable_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name, applicable_from)
);

CREATE TABLE IF NOT EXISTS price_list_item (
  id TEXT NOT NULL PRIMARY KEY,
  price_list_id TEXT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  from_qty REAL NOT NULL DEFAULT 0,
  to_qty REAL,
  rate INTEGER NOT NULL,
  discount_percent REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_header (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL CHECK (order_type IN ('Sales Order', 'Purchase Order', 'Job Work In', 'Job Work Out')),
  order_number TEXT NOT NULL,
  date TEXT NOT NULL,
  party_ledger_id TEXT NOT NULL REFERENCES ledger(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Partial', 'Completed', 'Cancelled')),
  total_amount INTEGER NOT NULL DEFAULT 0,
  narration TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, order_type, order_number)
);

CREATE TABLE IF NOT EXISTS order_line (
  id TEXT NOT NULL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES order_header(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_item(id),
  quantity REAL NOT NULL,
  fulfilled_quantity REAL NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL,
  amount INTEGER NOT NULL
);
` as const;
