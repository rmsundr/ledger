import {
  LedgerRepository,
  type Db,
  type GroupNature,
  type LedgerWithBalance,
} from '@ledgerdesk/db';

export interface TrialBalanceRow {
  id: string;
  name: string;
  isGroup: boolean;
  nature: GroupNature;
  parentName?: string;
  openingDebit: number;
  openingCredit: number;
  transactionDebit: number;
  transactionCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalTransactionDebit: number;
  totalTransactionCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
  difference: number;
}

export function generateTrialBalance(db: Db, companyId: string, asOfDate?: string): TrialBalanceReport {
  const ledgerRepo = new LedgerRepository(db);
  const ledgers: LedgerWithBalance[] = ledgerRepo.listWithBalances(companyId, asOfDate);

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalTransactionDebit = 0;
  let totalTransactionCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  const rows: TrialBalanceRow[] = ledgers.map((l) => {
    const opDr = l.opening_is_debit === 1 ? l.opening_balance : 0;
    const opCr = l.opening_is_debit === 0 ? l.opening_balance : 0;
    const trDr = l.debit_total;
    const trCr = l.credit_total;
    const clDr = l.closing_is_debit === 1 ? l.closing_balance : 0;
    const clCr = l.closing_is_debit === 0 ? l.closing_balance : 0;

    totalOpeningDebit += opDr;
    totalOpeningCredit += opCr;
    totalTransactionDebit += trDr;
    totalTransactionCredit += trCr;
    totalClosingDebit += clDr;
    totalClosingCredit += clCr;

    return {
      id: l.id,
      name: l.name,
      isGroup: false,
      nature: l.group_nature,
      parentName: l.group_name,
      openingDebit: opDr,
      openingCredit: opCr,
      transactionDebit: trDr,
      transactionCredit: trCr,
      closingDebit: clDr,
      closingCredit: clCr,
    };
  });

  const diff = totalClosingDebit - totalClosingCredit;
  const isBalanced = diff === 0;

  return {
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalTransactionDebit,
    totalTransactionCredit,
    totalClosingDebit,
    totalClosingCredit,
    isBalanced,
    difference: diff,
  };
}
