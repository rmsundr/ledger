import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, CompanyRegistry, migrate } from '@ledgerdesk/db';
import { AccountingService } from './accountingService.js';
import { StatutoryService } from './statutoryService.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupTestEnvironment() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-statutory-'));
  tempDirs.push(dir);
  const regDb = openDatabase(path.join(dir, 'registry.db'));
  migrate(regDb);
  const reg = new CompanyRegistry(regDb, dir);
  const created = reg.create({
    name: 'Sunrise Enterprise',
    financialYearBegin: '2025-04-01',
    booksBegin: '2025-04-01',
    state: 'Karnataka',
  });
  const db = openDatabase(created.dbPath);
  return { dir, regDb, db, companyId: created.companyId, dbPath: created.dbPath };
}

describe('StatutoryService — GSTIN validation', () => {
  it('rejects a GSTIN that is not 15 characters', () => {
    const result = StatutoryService.validateGstin('29ABCDE1234F1Z');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/15 characters/);
  });

  it('rejects a GSTIN with an invalid character pattern', () => {
    // Contains non-alphanumeric character '$'
    const result = StatutoryService.validateGstin('29ABCDE1234$1Z5');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/character pattern/);
  });

  it('rejects an out-of-range state code', () => {
    // 99 is not a valid GST state code.
    const result = StatutoryService.validateGstin('99ABCDE1234F1Z5');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/state code/);
  });

  it('rejects an invalid pattern as a bad gstin', () => {
    const result = StatutoryService.validateGstin('INVALIDGSTIN');
    expect(result.isValid).toBe(false);
  });

  it('accepts a well-formed GSTIN', () => {
    // 29ABCDE1234F1Z5 — a synthetic but structurally valid GSTIN.
    const result = StatutoryService.validateGstin('29ABCDE1234F1Z5');
    expect(result.isValid).toBe(true);
  });

  it('is case insensitive and trims whitespace', () => {
    const result = StatutoryService.validateGstin('  29abcde1234f1z5  ');
    expect(result.isValid).toBe(true);
  });
});

describe('StatutoryService — GSTR-3B', () => {
  it('nets outward tax against input tax credit', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const acct = new AccountingService(db);
    const stat = new StatutoryService(db);

    const group = (name: string) =>
      (db.prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = ?`).get(companyId, name) as {
        id: string;
      }).id;

    const customer = acct.createLedger(companyId, {
      name: 'Alpha Infotech',
      groupId: group('Sundry Debtors'),
      state: 'Karnataka',
    });
    const supplier = acct.createLedger(companyId, {
      name: 'Beta Supplies',
      groupId: group('Sundry Creditors'),
      state: 'Karnataka',
    });
    const sales = acct.createLedger(companyId, {
      name: 'Sales 18%',
      groupId: group('Sales Accounts'),
    });
    const purchases = acct.createLedger(companyId, {
      name: 'Purchases 18%',
      groupId: group('Purchase Accounts'),
    });
    const cgst = acct.createLedger(companyId, {
      name: 'CGST Output 9%',
      groupId: group('Duties & Taxes'),
    });
    const sgst = acct.createLedger(companyId, {
      name: 'SGST Output 9%',
      groupId: group('Duties & Taxes'),
    });

    const vt = (name: string) =>
      (db.prepare(`SELECT id, name FROM voucher_type WHERE company_id = ? AND name = ?`).get(companyId, name) as {
        id: string;
        name: string;
      });

    const salesVt = vt('Sales');
    const purchaseVt = vt('Purchase');

    // Sale of ₹20,000 + 18% GST to a customer (an Assets group party).
    acct.postVoucher(companyId, {
      voucherTypeId: salesVt.id,
      voucherTypeName: salesVt.name,
      date: '2025-04-15',
      narration: 'Sale',
      ledgerEntries: [
        { ledgerId: customer.id, isDebit: true, amount: 2360000 },
        { ledgerId: sales.id, isDebit: false, amount: 2000000 },
        { ledgerId: cgst.id, isDebit: false, amount: 180000 },
        { ledgerId: sgst.id, isDebit: false, amount: 180000 },
      ],
      gstSummary: {
        placeOfSupply: 'Karnataka',
        isInterState: false,
        taxableValue: 2000000,
        cgstAmount: 180000,
        sgstAmount: 180000,
        igstAmount: 0,
      },
    });

    // Purchase of ₹10,000 + 18% GST from a supplier (a Liabilities group party).
    acct.postVoucher(companyId, {
      voucherTypeId: purchaseVt.id,
      voucherTypeName: purchaseVt.name,
      date: '2025-04-16',
      narration: 'Purchase',
      ledgerEntries: [
        { ledgerId: purchases.id, isDebit: true, amount: 1180000 },
        { ledgerId: supplier.id, isDebit: false, amount: 1000000 },
        { ledgerId: cgst.id, isDebit: false, amount: 90000 },
        { ledgerId: sgst.id, isDebit: false, amount: 90000 },
      ],
      gstSummary: {
        placeOfSupply: 'Karnataka',
        isInterState: false,
        taxableValue: 1000000,
        cgstAmount: 90000,
        sgstAmount: 90000,
        igstAmount: 0,
      },
    });

    const summary = stat.getGstr3bSummary(companyId, '2025-04');

    expect(summary.outwardTaxableValue).toBe(2000000);
    expect(summary.outwardCgst).toBe(180000);
    expect(summary.outwardSgst).toBe(180000);

    // ITC is capped at the outward liability.
    expect(summary.itcCgst).toBe(90000);
    expect(summary.itcSgst).toBe(90000);

    expect(summary.payableCgst).toBe(90000);
    expect(summary.payableSgst).toBe(90000);
    expect(summary.totalPayable).toBe(180000);

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('rejects a tax period that is not YYYY-MM', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const stat = new StatutoryService(db);

    expect(() => stat.getGstr3bSummary(companyId, '2025-04-15')).toThrow(/tax period/);
    expect(() => stat.getGstr3bSummary(companyId, 'April 2025')).toThrow(/tax period/);

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('returns a zero summary for a period with no transactions', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const stat = new StatutoryService(db);

    const summary = stat.getGstr3bSummary(companyId, '2025-05');
    expect(summary.totalPayable).toBe(0);
    expect(summary.outwardTaxableValue).toBe(0);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});

describe('StatutoryService — e-Invoice and e-Way Bill', () => {
  it('builds an e-invoice payload from a GST voucher', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const acct = new AccountingService(db);
    const stat = new StatutoryService(db);

    const group = (name: string) =>
      (db.prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = ?`).get(companyId, name) as {
        id: string;
      }).id;

    const customer = acct.createLedger(companyId, {
      name: 'Alpha Infotech',
      groupId: group('Sundry Debtors'),
      state: 'Karnataka',
    });
    const sales = acct.createLedger(companyId, {
      name: 'Sales 18%',
      groupId: group('Sales Accounts'),
    });
    const cgst = acct.createLedger(companyId, {
      name: 'CGST Output 9%',
      groupId: group('Duties & Taxes'),
    });
    const sgst = acct.createLedger(companyId, {
      name: 'SGST Output 9%',
      groupId: group('Duties & Taxes'),
    });

    const vt = db
      .prepare(`SELECT id, name FROM voucher_type WHERE company_id = ? AND name = 'Sales'`)
      .get(companyId) as { id: string; name: string };

    const voucher = acct.postVoucher(companyId, {
      voucherTypeId: vt.id,
      voucherTypeName: vt.name,
      date: '2025-04-15',
      narration: 'Sale',
      ledgerEntries: [
        { ledgerId: customer.id, isDebit: true, amount: 2360000 },
        { ledgerId: sales.id, isDebit: false, amount: 2000000 },
        { ledgerId: cgst.id, isDebit: false, amount: 180000 },
        { ledgerId: sgst.id, isDebit: false, amount: 180000 },
      ],
      gstSummary: {
        placeOfSupply: 'Karnataka',
        isInterState: false,
        taxableValue: 2000000,
        cgstAmount: 180000,
        sgstAmount: 180000,
        igstAmount: 0,
      },
    });

    const payload = stat.buildEInvoicePayload(companyId, voucher.id);
    expect(payload['Invoice Details']['Invoice No']).toBe(voucher.voucher_number);
    expect(payload['Invoice Details']['Place Of Supply']).toBe('Karnataka');
    expect(payload.Buyer['Legal Name']).toBe('Alpha Infotech');
    expect(payload['Tax Summary']['Total Taxable Value']).toBe(20000);
    expect(payload['Tax Summary']['Total CGST']).toBe(1800);
    expect(payload['Tax Summary']['Total Invoice Value']).toBe(23600);

    const eway = stat.buildEwayBillPayload(companyId, voucher.id);
    expect(eway.documentNumber).toBe(voucher.voucher_number);
    expect(eway.documentDate).toBe('2025-04-15');
    expect(eway.placeOfSupply).toBe('Karnataka');
    expect(eway.itemValue).toBe(20000);

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('throws rather than fabricating a payload for a voucher with no GST summary', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const acct = new AccountingService(db);
    const stat = new StatutoryService(db);

    const group = (name: string) =>
      (db.prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = ?`).get(companyId, name) as {
        id: string;
      }).id;

    const cash = acct.createLedger(companyId, { name: 'Cash A/c', groupId: group('Cash-in-Hand') });
    const sales = acct.createLedger(companyId, { name: 'Sales', groupId: group('Sales Accounts') });

    const vt = db
      .prepare(`SELECT id, name FROM voucher_type WHERE company_id = ? AND name = 'Sales'`)
      .get(companyId) as { id: string; name: string };

    const voucher = acct.postVoucher(companyId, {
      voucherTypeId: vt.id,
      voucherTypeName: vt.name,
      date: '2025-04-15',
      narration: 'Sale without GST',
      ledgerEntries: [
        { ledgerId: cash.id, isDebit: true, amount: 1000 },
        { ledgerId: sales.id, isDebit: false, amount: 1000 },
      ],
    });

    expect(() => stat.buildEInvoicePayload(companyId, voucher.id)).toThrow(/GST summary/);
    expect(() => stat.buildEwayBillPayload(companyId, voucher.id)).toThrow(/GST summary/);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});
