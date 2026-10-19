import type { Db, LedgerRecord } from '@ledgerdesk/db';

export interface LedgerStatementLine {
  voucherId: string;
  voucherNumber: string;
  voucherTypeName: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  runningBalance: number;
  runningIsDebit: boolean;
}

export interface LedgerStatementReport {
  ledger: LedgerRecord;
  openingBalance: number;
  openingIsDebit: boolean;
  lines: LedgerStatementLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingIsDebit: boolean;
}

export function generateLedgerStatement(
  db: Db,
  companyId: string,
  ledgerId: string,
  filter?: { fromDate?: string; toDate?: string },
): LedgerStatementReport {
  const ledger = db
    .prepare(`SELECT * FROM ledger WHERE id = ? AND company_id = ? AND deleted_at IS NULL`)
    .get(ledgerId, companyId) as LedgerRecord | undefined;

  if (!ledger) {
    throw new Error(`Ledger not found: ${ledgerId}`);
  }

  const conditions = [
    'vle.ledger_id = ?',
    'v.company_id = ?',
    'v.is_cancelled = 0',
    'v.is_optional = 0',
    'v.deleted_at IS NULL',
  ];
  const params: unknown[] = [ledgerId, companyId];

  if (filter?.fromDate) {
    conditions.push('v.date >= ?');
    params.push(filter.fromDate);
  }
  if (filter?.toDate) {
    conditions.push('v.date <= ?');
    params.push(filter.toDate);
  }

  const sql = `
    SELECT
      vle.voucher_id,
      vle.is_debit,
      vle.amount,
      v.voucher_number,
      v.voucher_type_name,
      v.date,
      (
        SELECT GROUP_CONCAT(ol.name, ', ')
        FROM voucher_ledger_entry other_vle
        JOIN ledger ol ON other_vle.ledger_id = ol.id
        WHERE other_vle.voucher_id = v.id AND other_vle.ledger_id != vle.ledger_id
      ) AS particulars
    FROM voucher_ledger_entry vle
    JOIN voucher v ON vle.voucher_id = v.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY v.date ASC, v.created_at ASC
  `;

  const rows = db.prepare(sql).all(...params) as {
    voucher_id: string;
    is_debit: number;
    amount: number;
    voucher_number: string;
    voucher_type_name: string;
    date: string;
    particulars: string | null;
  }[];

  let currentSigned = ledger.opening_is_debit === 1 ? ledger.opening_balance : -ledger.opening_balance;
  let totalDebit = 0;
  let totalCredit = 0;

  const lines: LedgerStatementLine[] = rows.map((r) => {
    const debit = r.is_debit === 1 ? r.amount : 0;
    const credit = r.is_debit === 0 ? r.amount : 0;
    totalDebit += debit;
    totalCredit += credit;

    currentSigned += debit - credit;
    const runningIsDebit = currentSigned >= 0;
    const runningBalance = Math.abs(currentSigned);

    return {
      voucherId: r.voucher_id,
      voucherNumber: r.voucher_number,
      voucherTypeName: r.voucher_type_name,
      date: r.date,
      particulars: r.particulars ?? 'As per details',
      debit,
      credit,
      runningBalance,
      runningIsDebit,
    };
  });

  const closingBalance = Math.abs(currentSigned);
  const closingIsDebit = currentSigned >= 0;

  return {
    ledger,
    openingBalance: ledger.opening_balance,
    openingIsDebit: ledger.opening_is_debit === 1,
    lines,
    totalDebit,
    totalCredit,
    closingBalance,
    closingIsDebit,
  };
}
