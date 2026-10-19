import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from './connection.js';
import { getCurrentSchemaVersion, migrate } from './migrate.js';
import { CompanyRegistry } from './registry.js';
import { DEFAULT_GROUPS } from './seeds/defaultGroups.js';
import { DEFAULT_VOUCHER_TYPES } from './seeds/defaultVoucherTypes.js';
import { CompanyRepository } from './repositories/companyRepository.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('migrate + company create', () => {
  it('applies foundation migration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-db-'));
    tempDirs.push(dir);
    const db = openDatabase(path.join(dir, 't.db'));
    expect(getCurrentSchemaVersion(db)).toBe(0);
    const result = migrate(db);
    expect(result.to).toBe(7);
    expect(getCurrentSchemaVersion(db)).toBe(7);
    closeDatabase(db);
  });

  it('creates company with 28 default groups and voucher types', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-reg-'));
    tempDirs.push(dir);
    const registryDb = openDatabase(path.join(dir, 'registry.db'));
    migrate(registryDb);
    const registry = new CompanyRegistry(registryDb, dir);
    const created = registry.create({
      name: 'Demo Traders',
      financialYearBegin: '2025-04-01',
      booksBegin: '2025-04-01',
      state: 'Kerala',
    });
    expect(created.companyId).toBeTruthy();
    expect(fs.existsSync(created.dbPath)).toBe(true);

    const companyDb = openDatabase(created.dbPath, { fileMustExist: true });
    const repo = new CompanyRepository(companyDb);
    const company = repo.getCompany();
    expect(company?.name).toBe('Demo Traders');
    const groups = repo.listGroups(created.companyId);
    expect(groups).toHaveLength(DEFAULT_GROUPS.length);
    expect(repo.countVoucherTypes(created.companyId)).toBe(DEFAULT_VOUCHER_TYPES.length);
    closeDatabase(companyDb);
    closeDatabase(registryDb);
  });
});
