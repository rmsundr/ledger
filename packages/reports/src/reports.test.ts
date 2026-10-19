import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, CompanyRegistry, migrate } from '@ledgerdesk/db';
import { AccountingService } from '@ledgerdesk/core';
import {
  generateBalanceSheet,
  generateDayBook,
  generateLedgerStatement,
  generateProfitAndLoss,
  generateTrialBalance,
} from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupCompanyWithBooks() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-rep-test-'));
  tempDirs.push(dir);
  const regDb = openDatabase(path.join(dir, 'registry.db'));
  migrate(regDb);
  const reg = new CompanyRegistry(regDb, dir);
  const created = reg.create({
    name: 'Apex Infotech Ltd',
    financialYearBegin: '2025-04-01',
    booksBegin: '2025-04-01',
    state: 'Delhi',
  });
  const db = openDatabase(created.dbPath);
  return { dir, regDb, db, companyId: created.companyId };
}

describe('Reports Package — Financial Statements & Invariants', () => {
  it('generates fully reconciled Trial Balance, P&L, Balance Sheet, Day Book, and Ledger Statement', () => {
    const { regDb, db, companyId } = setupCompanyWithBooks();
    const acct = new AccountingService(db);

    // Look up groups
    const getGroupId = (name: string) => {
      const row = db.prepare(`SELECT id FROM "group" WHERE company_id = ? AND name = ?`).get(companyId, name) as { id: string };
      return row.id;
    };

    const capital = acct.createLedger(companyId, {
      name: 'Owner Equity',
      groupId: getGroupId('Capital Account'),
      openingBalance: 50000000, // ₹5,00,000.00 (50000000 paise)
      openingIsDebit: false, // Cr
    });
    expect(capital.id).toBeTruthy();

    const bank = acct.createLedger(companyId, {
      name: 'State Bank of India',
      groupId: getGroupId('Bank Accounts'),
      openingBalance: 50000000, // ₹5,00,000.00
      openingIsDebit: true, // Dr
    });

    const salesLedger = acct.createLedger(companyId, {
      name: 'Consulting Revenue',
      groupId: getGroupId('Sales Accounts'),
    });

    const rentLedger = acct.createLedger(companyId, {
      name: 'Office Rent',
      groupId: getGroupId('Indirect Expenses'),
    });

    const client = acct.createLedger(companyId, {
      name: 'Global Tech Corp',
      groupId: getGroupId('Sundry Debtors'),
      maintainBillByBill: true,
    });

    // Voucher types
    const getVt = (name: string) => {
      return db.prepare(`SELECT id, name FROM voucher_type WHERE company_id = ? AND name = ?`).get(companyId, name) as {
        id: string;
        name: string;
      };
    };

    // 1. Post Sales Invoice: Dr Client ₹1,00,000.00 (10000000 paise), Cr Consulting Revenue ₹1,00,000.00
    const salesVt = getVt('Sales');
    acct.postVoucher(companyId, {
      voucherTypeId: salesVt.id,
      voucherTypeName: salesVt.name,
      date: '2025-04-10',
      narration: 'IT Consulting Services for Q1',
      ledgerEntries: [
        { ledgerId: client.id, isDebit: true, amount: 10000000 },
        { ledgerId: salesLedger.id, isDebit: false, amount: 10000000 },
      ],
    });

    // 2. Post Receipt: Dr Bank ₹60,000.00 (6000000 paise), Cr Client ₹60,000.00
    const receiptVt = getVt('Receipt');
    acct.postVoucher(companyId, {
      voucherTypeId: receiptVt.id,
      voucherTypeName: receiptVt.name,
      date: '2025-04-15',
      narration: 'Part payment received from Global Tech Corp',
      ledgerEntries: [
        { ledgerId: bank.id, isDebit: true, amount: 6000000 },
        { ledgerId: client.id, isDebit: false, amount: 6000000 },
      ],
    });

    // 3. Post Payment: Dr Rent Expense ₹20,000.00 (2000000 paise), Cr Bank ₹20,000.00
    const paymentVt = getVt('Payment');
    acct.postVoucher(companyId, {
      voucherTypeId: paymentVt.id,
      voucherTypeName: paymentVt.name,
      date: '2025-04-20',
      narration: 'April 2025 office rent',
      ledgerEntries: [
        { ledgerId: rentLedger.id, isDebit: true, amount: 2000000 },
        { ledgerId: bank.id, isDebit: false, amount: 2000000 },
      ],
    });

    // --- REPORT VERIFICATION ---

    // 1. Trial Balance Invariant: Total Debit == Total Credit
    const tb = generateTrialBalance(db, companyId);
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
    expect(tb.totalClosingDebit).toBe(tb.totalClosingCredit);

    // 2. Profit and Loss:
    // Revenue = ₹1,00,000 (10000000)
    // Expense = ₹20,000 (2000000)
    // Net Profit = ₹80,000 (8000000)
    const pnl = generateProfitAndLoss(db, companyId);
    expect(pnl.totalDirectIncome).toBe(10000000);
    expect(pnl.grossProfit).toBe(10000000);
    expect(pnl.totalIndirectExpense).toBe(2000000);
    expect(pnl.netProfit).toBe(8000000);
    expect(pnl.netLoss).toBe(0);

    // 3. Balance Sheet Invariant: Total Liabilities (including Net Profit) == Total Assets
    // Assets:
    // Bank = 50000000 + 6000000 - 2000000 = 54000000
    // Debtors = 10000000 - 6000000 = 4000000
    // Total Assets = 58000000
    // Liabilities:
    // Capital = 50000000
    // Net Profit = 8000000
    // Total Liabilities = 58000000
    const bs = generateBalanceSheet(db, companyId);
    expect(bs.isBalanced).toBe(true);
    expect(bs.difference).toBe(0);
    expect(bs.totalAssets).toBe(58000000);
    expect(bs.totalLiabilities).toBe(58000000);

    // 4. Day Book:
    const dayBook = generateDayBook(db, companyId);
    expect(dayBook.count).toBe(3);
    expect(dayBook.entries[0].voucherNumber).toBe('1');

    // 5. Ledger Statement:
    const clientStmt = generateLedgerStatement(db, companyId, client.id);
    expect(clientStmt.openingBalance).toBe(0);
    expect(clientStmt.lines).toHaveLength(2);
    expect(clientStmt.totalDebit).toBe(10000000);
    expect(clientStmt.totalCredit).toBe(6000000);
    expect(clientStmt.closingBalance).toBe(4000000);
    expect(clientStmt.closingIsDebit).toBe(true);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});
