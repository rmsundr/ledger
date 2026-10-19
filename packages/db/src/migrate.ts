import type { Db } from './connection.js';
import { migration001 } from './migrations/001_foundation.js';
import { migration002 } from './migrations/002_accounting.js';
import { migration003 } from './migrations/003_bill_cost_bank.js';
import { migration004 } from './migrations/004_inventory.js';
import { migration005 } from './migrations/005_statutory.js';
import { migration006 } from './migrations/006_payroll.js';
import { migration007 } from './migrations/007_tally_and_utilities.js';

interface Migration {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Foundation schema — company, masters skeleton, registry',
    sql: migration001,
  },
  {
    version: 2,
    description: 'Accounting vouchers, ledger entries, sequences, bank/tax details',
    sql: migration002,
  },
  {
    version: 3,
    description: 'Bill-wise details, cost centres, bank allocations, budgets, interest',
    sql: migration003,
  },
  {
    version: 4,
    description: 'Inventory masters, stock ledger, BOM, batches, orders',
    sql: migration004,
  },
  {
    version: 5,
    description: 'Statutory: GST, TDS/TCS, Fixed Assets & Depreciation',
    sql: migration005,
  },
  {
    version: 6,
    description: 'Payroll module',
    sql: migration006,
  },
  {
    version: 7,
    description: 'Tally import maps, jobs & report configurations',
    sql: migration007,
  },
];

export function getCurrentSchemaVersion(db: Db): number {
  const exists = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`,
    )
    .get();
  if (!exists) return 0;
  const row = db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_version`).get() as {
    v: number;
  };
  return row.v;
}

export function migrate(db: Db): { from: number; to: number } {
  const from = getCurrentSchemaVersion(db);
  let to = from;

  const run = db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (migration.version <= from) continue;
      db.exec(migration.sql);
      db.prepare(`INSERT INTO schema_version (version, description) VALUES (?, ?)`).run(
        migration.version,
        migration.description,
      );
      to = migration.version;
    }
  });

  run();
  return { from, to };
}

export { MIGRATIONS };
