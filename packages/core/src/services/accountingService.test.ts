import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, CompanyRegistry, migrate } from '@ledgerdesk/db';
import { AccountingService } from './accountingService.js';
import { StatutoryService } from './statutoryService.js';
import { BillWiseService } from './billWiseService.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupTestEnvironment() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-core-test-'));
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
  return { dir, regDb, db, companyId: created.companyId };
}

describe('Accounting & Domain Services', () => {
  it('handles ledger creation and multi-line balanced voucher entry', () => {
    const { regDb, db, companyId } = setupTestEnvironment();
    const acct = new AccountingService(db);
    const bankGroup = db
      .prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = 'Bank Accounts'`)
      .get(companyId) as { id: string };
    const salesGroup = db
      .prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = 'Sales Accounts'`)
      .get(companyId) as { id: string };
    const debtorsGroup = db
      .prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = 'Sundry Debtors'`)
      .get(companyId) as { id: string };

    const icici = acct.createLedger(companyId, {
      name: 'ICICI Current A/c',
      groupId: bankGroup.id,
      openingBalance: 5000000, // ₹50,000.00
      openingIsDebit: true,
    });

    const salesLedger = acct.createLedger(companyId, {
      name: 'Domestic Sales 18%',
      groupId: salesGroup.id,
    });

    const customer = acct.createLedger(companyId, {
      name: 'Alpha Infotech',
      groupId: debtorsGroup.id,
      maintainBillByBill: true,
      state: 'Karnataka',
      gstin: '29ABCDE1234F1Z5',
    });

    expect(icici.name).toBe('ICICI Current A/c');
    expect(customer.maintain_bill_by_bill).toBe(1);

    const salesVt = db
      .prepare(`SELECT id, name FROM voucher_type WHERE company_id = ? AND name = 'Sales'`)
      .get(companyId) as { id: string; name: string };

    // Post Sales Voucher: Dr Customer ₹23,600 (2360000 paise), Cr Sales ₹20,000 (2000000 paise), Cr CGST ₹1,800 (180000), Cr SGST ₹1,800 (180000)
    // First, let's create CGST and SGST ledgers
    const dutiesGroup = db
      .prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = 'Duties & Taxes'`)
      .get(companyId) as { id: string };

    const cgst = acct.createLedger(companyId, {
      name: 'CGST Output 9%',
      groupId: dutiesGroup.id,
    });
    const sgst = acct.createLedger(companyId, {
      name: 'SGST Output 9%',
      groupId: dutiesGroup.id,
    });

    const voucher = acct.postVoucher(companyId, {
      voucherTypeId: salesVt.id,
      voucherTypeName: salesVt.name,
      date: '2025-04-15',
      narration: 'Invoice for software services',
      ledgerEntries: [
        { ledgerId: customer.id, isDebit: true, amount: 2360000 },
        { ledgerId: salesLedger.id, isDebit: false, amount: 2000000 },
        { ledgerId: cgst.id, isDebit: false, amount: 180000 },
        { ledgerId: sgst.id, isDebit: false, amount: 180000 },
      ],
      billAllocations: [
        {
          entryIndex: 0,
          partyLedgerId: customer.id,
          refType: 'New Ref',
          refName: 'INV-2025-001',
          amount: 2360000,
          isDebit: true,
          dueDate: '2025-05-15',
        },
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

    expect(voucher.id).toBeTruthy();
    expect(voucher.voucher_number).toBe('1');
    expect(voucher.ledger_entries).toHaveLength(4);
    expect(voucher.bill_allocations).toHaveLength(1);
    expect(voucher.gst_summary?.taxable_value).toBe(2000000);

    // Verify Balances
    const balances = acct.listLedgersWithBalances(companyId);
    const customerBal = balances.find((b) => b.id === customer.id)!;
    expect(customerBal.closing_balance).toBe(2360000);
    expect(customerBal.closing_is_debit).toBe(1);

    const salesBal = balances.find((b) => b.id === salesLedger.id)!;
    expect(salesBal.closing_balance).toBe(2000000);
    expect(salesBal.closing_is_debit).toBe(0); // Credit

    // Test Bill Outstanding and Ageing
    const billService = new BillWiseService(db);
    const receivables = billService.listBillsReceivable(companyId, '2025-04-30');
    expect(receivables).toHaveLength(1);
    expect(receivables[0].pending_amount).toBe(2360000);
    expect(receivables[0].ref_name).toBe('INV-2025-001');

    // Test GST calculations
    const statutory = new StatutoryService(db);
    const intraCalc = statutory.calculateGst({
      taxableValue: 100000, // ₹1,000.00
      gstRate: 18,
      companyState: 'Karnataka',
      partyState: 'Karnataka',
    });
    expect(intraCalc.isInterState).toBe(false);
    expect(intraCalc.cgstAmount).toBe(9000); // 9%
    expect(intraCalc.sgstAmount).toBe(9000); // 9%
    expect(intraCalc.igstAmount).toBe(0);

    const interCalc = statutory.calculateGst({
      taxableValue: 100000,
      gstRate: 18,
      companyState: 'Karnataka',
      partyState: 'Tamil Nadu',
    });
    expect(interCalc.isInterState).toBe(true);
    expect(interCalc.igstAmount).toBe(18000); // 18%
    expect(interCalc.cgstAmount).toBe(0);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});
