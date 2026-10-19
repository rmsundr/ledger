import type { Db } from '@ledgerdesk/db';

export interface DayBookEntry {
  voucherId: string;
  voucherNumber: string;
  voucherTypeName: string;
  date: string;
  partyLedger: string;
  amount: number;
  narration: string;
  isCancelled: boolean;
}

export interface DayBookReport {
  entries: DayBookEntry[];
  totalAmount: number;
  count: number;
}

export function generateDayBook(
  db: Db,
  companyId: string,
  filter?: { fromDate?: string; toDate?: string; voucherTypeId?: string },
): DayBookReport {
  const conditions = ['v.company_id = ?', 'v.deleted_at IS NULL'];
  const params: unknown[] = [companyId];

  if (filter?.fromDate) {
    conditions.push('v.date >= ?');
    params.push(filter.fromDate);
  }
  if (filter?.toDate) {
    conditions.push('v.date <= ?');
    params.push(filter.toDate);
  }
  if (filter?.voucherTypeId) {
    conditions.push('v.voucher_type_id = ?');
    params.push(filter.voucherTypeId);
  }

  const sql = `
    SELECT
      v.id,
      v.voucher_number,
      v.voucher_type_name,
      v.date,
      v.total_amount,
      v.narration,
      v.is_cancelled,
      (
        SELECT l.name FROM voucher_ledger_entry vle
        JOIN ledger l ON vle.ledger_id = l.id
        WHERE vle.voucher_id = v.id
        ORDER BY vle.entry_index ASC LIMIT 1
      ) AS party_ledger
    FROM voucher v
    WHERE ${conditions.join(' AND ')}
    ORDER BY v.date DESC, v.created_at DESC
  `;

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    voucher_number: string;
    voucher_type_name: string;
    date: string;
    total_amount: number;
    narration: string;
    is_cancelled: number;
    party_ledger: string | null;
  }[];

  let totalAmount = 0;
  const entries: DayBookEntry[] = rows.map((r) => {
    if (!r.is_cancelled) {
      totalAmount += r.total_amount;
    }
    return {
      voucherId: r.id,
      voucherNumber: r.voucher_number,
      voucherTypeName: r.voucher_type_name,
      date: r.date,
      partyLedger: r.party_ledger ?? '—',
      amount: r.total_amount,
      narration: r.narration,
      isCancelled: r.is_cancelled === 1,
    };
  });

  return {
    entries,
    totalAmount,
    count: entries.length,
  };
}
