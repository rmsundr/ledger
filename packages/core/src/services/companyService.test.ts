import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyService } from './companyService.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('CompanyService', () => {
  it('creates, opens and shuts a company', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-core-'));
    tempDirs.push(dir);
    const svc = new CompanyService(dir);

    const created = svc.createCompany({
      name: 'Alpha Stores',
      financialYearBegin: '2025-04-01',
      booksBegin: '2025-04-01',
      state: 'Karnataka',
      gstin: '',
    });

    expect(svc.listCompanies()).toHaveLength(1);
    const session = svc.openCompany(created.registryId, '2025-10-19');
    expect(session.company.name).toBe('Alpha Stores');
    expect(session.groups.length).toBeGreaterThanOrEqual(28);
    expect(session.features.gst).toBe(1);
    expect(session.currentDate).toBe('2025-10-19');

    const features = svc.updateFeatures({ cost_centres: 1, payroll: 1 });
    expect(features.cost_centres).toBe(1);
    expect(features.payroll).toBe(1);

    svc.shutCompany();
    expect(svc.getSessionSnapshot()).toBeNull();
    svc.dispose();
  });

  it('rejects invalid company payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-core-bad-'));
    tempDirs.push(dir);
    const svc = new CompanyService(dir);
    expect(() =>
      svc.createCompany({
        name: '',
        financialYearBegin: '2025-04-01',
        booksBegin: '2025-04-01',
      }),
    ).toThrow();
    svc.dispose();
  });
});
