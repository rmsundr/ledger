import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, type Db, closeDatabase, integrityCheck } from './connection.js';
import { migrate } from './migrate.js';
import { newId } from './ids.js';
import { seedNewCompany } from './seeds/seedCompany.js';
import type { AppRegistryRecord, CreateCompanyInput } from './types.js';

export interface DataPaths {
  dataDir: string;
  registryPath: string;
  companiesDir: string;
}

export function resolveDataPaths(dataDir: string): DataPaths {
  return {
    dataDir,
    registryPath: path.join(dataDir, 'registry.db'),
    companiesDir: path.join(dataDir, 'companies'),
  };
}

export function openRegistry(dataDir: string): Db {
  const { registryPath, companiesDir } = resolveDataPaths(dataDir);
  fs.mkdirSync(companiesDir, { recursive: true });
  const db = openDatabase(registryPath);
  migrate(db);
  return db;
}

function safeFileName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'company';
}

export class CompanyRegistry {
  constructor(private readonly registryDb: Db, private readonly dataDir: string) {}

  list(): AppRegistryRecord[] {
    return this.registryDb
      .prepare(`SELECT * FROM app_registry ORDER BY COALESCE(last_opened_at, created_at) DESC`)
      .all() as AppRegistryRecord[];
  }

  get(id: string): AppRegistryRecord | undefined {
    return this.registryDb
      .prepare(`SELECT * FROM app_registry WHERE id = ?`)
      .get(id) as AppRegistryRecord | undefined;
  }

  create(input: CreateCompanyInput): { registryId: string; dbPath: string; companyId: string } {
    const { companiesDir } = resolveDataPaths(this.dataDir);
    const registryId = newId();
    const fileBase = `${safeFileName(input.name)}-${registryId.slice(0, 8)}.db`;
    const dbPath = path.join(companiesDir, fileBase);

    const companyDb = openDatabase(dbPath);
    try {
      migrate(companyDb);
      const { companyId } = seedNewCompany(companyDb, input);
      const check = integrityCheck(companyDb);
      if (!check.ok) {
        throw new Error(`New company DB failed integrity check: ${check.message}`);
      }

      this.registryDb
        .prepare(
          `INSERT INTO app_registry (
            id, name, db_path, mailing_name, financial_year_begin, books_begin, last_opened_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          registryId,
          input.name.trim(),
          dbPath,
          input.mailingName?.trim() || input.name.trim(),
          input.financialYearBegin,
          input.booksBegin,
        );

      return { registryId, dbPath, companyId };
    } finally {
      closeDatabase(companyDb);
    }
  }

  markOpened(registryId: string): void {
    this.registryDb
      .prepare(`UPDATE app_registry SET last_opened_at = datetime('now') WHERE id = ?`)
      .run(registryId);
  }

  shut(registryId: string): void {
    // Soft close — just clear last session marker; DB file remains
    void registryId;
  }

  delete(registryId: string, removeFile: boolean): void {
    const row = this.get(registryId);
    if (!row) return;
    this.registryDb.prepare(`DELETE FROM app_registry WHERE id = ?`).run(registryId);
    if (removeFile && fs.existsSync(row.db_path)) {
      fs.unlinkSync(row.db_path);
      for (const suffix of ['-wal', '-shm']) {
        const p = row.db_path + suffix;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  }
}
