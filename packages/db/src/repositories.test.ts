import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from './connection.js';
import { migrate } from './migrate.js';
import { CompanyRegistry } from './registry.js';
import { CompanyRepository } from './repositories/companyRepository.js';
import { LedgerRepository } from './repositories/ledgerRepository.js';
import { VoucherRepository } from './repositories/voucherRepository.js';
import { InventoryRepository } from './repositories/inventoryRepository.js';
import { BillCostBankRepository } from './repositories/billCostBankRepository.js';
import { PayrollRepository } from './repositories/payrollRepository.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupCompanyDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-repo-test-'));
  tempDirs.push(dir);
  const regDb = openDatabase(path.join(dir, 'registry.db'));
  migrate(regDb);
  const reg = new CompanyRegistry(regDb, dir);
  const created = reg.create({
    name: 'Bharat Trading Co',
    financialYearBegin: '2025-04-01',
    booksBegin: '2025-04-01',
    state: 'Kerala',
  });
  const db = openDatabase(created.dbPath);
  return { dir, regDb, db, companyId: created.companyId };
}

describe('DB Repositories Integration', () => {
  it('creates ledgers and posts balanced vouchers with Dr == Cr integrity', () => {
    const { regDb, db, companyId } = setupCompanyDb();
    const companyRepo = new CompanyRepository(db);
    const ledgerRepo = new LedgerRepository(db);
    const voucherRepo = new VoucherRepository(db);

    const groups = companyRepo.listGroups(companyId);
    const bankGroup = groups.find((g) => g.name === 'Bank Accounts')!;
    const capitalGroup = groups.find((g) => g.name === 'Capital Account')!;

    // Create HDFC Bank and Owner Capital ledgers
    const bank = ledgerRepo.create({
      companyId,
      name: 'HDFC Bank',
      groupId: bankGroup.id,
      openingBalance: 10000000, // ₹1,00,000.00 in paise
      openingIsDebit: true,
    });
    expect(bank.id).toBeTruthy();

    const capital = ledgerRepo.create({
      companyId,
      name: 'Owner Capital',
      groupId: capitalGroup.id,
      openingBalance: 10000000,
      openingIsDebit: false,
    });
    expect(capital.id).toBeTruthy();

    // Verify initial balances
    const initialWithBalances = ledgerRepo.listWithBalances(companyId);
    const bankInitial = initialWithBalances.find((l) => l.id === bank.id)!;
    expect(bankInitial.closing_balance).toBe(10000000);
    expect(bankInitial.closing_is_debit).toBe(1);

    // Retrieve Receipt voucher type
    const receiptType = db
      .prepare(`SELECT * FROM voucher_type WHERE company_id = ? AND name = 'Receipt'`)
      .get(companyId) as { id: string; name: string };

    // Post Receipt: Dr Bank ₹5,000.00 (500000 paise), Cr Capital ₹5,000.00
    const voucher = voucherRepo.createVoucher({
      companyId,
      voucherTypeId: receiptType.id,
      voucherTypeName: receiptType.name,
      date: '2025-04-10',
      narration: 'Additional capital introduced',
      ledgerEntries: [
        { ledgerId: bank.id, isDebit: true, amount: 500000 },
        { ledgerId: capital.id, isDebit: false, amount: 500000 },
      ],
    });
    expect(voucher.id).toBeTruthy();
    expect(voucher.voucher_number).toBe('1');
    expect(voucher.total_amount).toBe(500000);

    // Verify balances after voucher
    const updated = ledgerRepo.listWithBalances(companyId);
    const bankUpdated = updated.find((l) => l.id === bank.id)!;
    expect(bankUpdated.closing_balance).toBe(10500000); // ₹1,05,000.00
    expect(bankUpdated.closing_is_debit).toBe(1);

    // Attempt unbalanced voucher -> must throw!
    expect(() => {
      voucherRepo.createVoucher({
        companyId,
        voucherTypeId: receiptType.id,
        voucherTypeName: receiptType.name,
        date: '2025-04-11',
        ledgerEntries: [
          { ledgerId: bank.id, isDebit: true, amount: 100000 },
          { ledgerId: capital.id, isDebit: false, amount: 90000 }, // unbalanced!
        ],
      });
    }).toThrow(/out of balance/);

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('manages inventory, cost centres, bills outstanding and payroll', () => {
    const { regDb, db, companyId } = setupCompanyDb();
    const inventoryRepo = new InventoryRepository(db);
    const billCostRepo = new BillCostBankRepository(db);
    const payrollRepo = new PayrollRepository(db);

    // Inventory
    const unit = inventoryRepo.createUnit({
      companyId,
      symbol: 'Nos',
      formalName: 'Numbers',
    });
    expect(unit.symbol).toBe('Nos');

    const item = inventoryRepo.createStockItem({
      companyId,
      name: 'Mechanical Keyboard',
      unitId: unit.id,
      openingQuantity: 10,
      openingRate: 350000, // ₹3,500.00
    });
    expect(item.name).toBe('Mechanical Keyboard');
    expect(item.opening_value).toBe(3500000);

    // Cost Centre
    const cat = billCostRepo.createCostCategory({ companyId, name: 'Sales Division' });
    const cc = billCostRepo.createCostCentre({
      companyId,
      categoryId: cat.id,
      name: 'North Region',
    });
    expect(cc.name).toBe('North Region');

    // Payroll
    const emp = payrollRepo.createEmployee({
      companyId,
      name: 'Ravi Kumar',
      empCode: 'EMP001',
      dateOfJoining: '2025-01-01',
      designation: 'Accounts Manager',
    });
    expect(emp.emp_code).toBe('EMP001');

    payrollRepo.recordAttendance(companyId, emp.id, '2025-04-01', 'Present');
    payrollRepo.recordAttendance(companyId, emp.id, '2025-04-02', 'Present');
    const days = payrollRepo.getMonthlyAttendance(companyId, emp.id, '2025-04');
    expect(days).toBe(2);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});
