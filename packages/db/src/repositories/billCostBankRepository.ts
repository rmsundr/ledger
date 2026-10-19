import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type { CostCategoryRecord, CostCentreRecord, VoucherBankAllocationRecord } from '../types.js';

export interface BillOutstandingItem {
  party_ledger_id: string;
  party_name: string;
  ref_name: string;
  ref_type: string;
  due_date: string | null;
  bill_date: string;
  original_amount: number;
  cleared_amount: number;
  pending_amount: number;
  is_debit: number;
  overdue_days: number;
}

export class BillCostBankRepository {
  constructor(private readonly db: Db) {}

  // Cost Centres
  listCostCategories(companyId: string): CostCategoryRecord[] {
    return this.db.prepare(`SELECT * FROM cost_category WHERE company_id = ? ORDER BY name`).all(companyId) as CostCategoryRecord[];
  }

  createCostCategory(input: { companyId: string; name: string }): CostCategoryRecord {
    const id = newId();
    this.db.prepare(`INSERT INTO cost_category (id, company_id, name) VALUES (?, ?, ?)`).run(id, input.companyId, input.name.trim());
    return this.db.prepare(`SELECT * FROM cost_category WHERE id = ?`).get(id) as CostCategoryRecord;
  }

  listCostCentres(companyId: string): (CostCentreRecord & { category_name: string })[] {
    return this.db.prepare(`
      SELECT cc.*, cat.name AS category_name
      FROM cost_centre cc
      JOIN cost_category cat ON cc.category_id = cat.id
      WHERE cc.company_id = ?
      ORDER BY cat.name, cc.name
    `).all(companyId) as (CostCentreRecord & { category_name: string })[];
  }

  createCostCentre(input: { companyId: string; categoryId: string; name: string; parentId?: string }): CostCentreRecord {
    const id = newId();
    this.db.prepare(`INSERT INTO cost_centre (id, company_id, category_id, name, parent_id) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      input.companyId,
      input.categoryId,
      input.name.trim(),
      input.parentId ?? null,
    );
    return this.db.prepare(`SELECT * FROM cost_centre WHERE id = ?`).get(id) as CostCentreRecord;
  }

  // Bill-wise Outstanding
  listBillsOutstanding(companyId: string, asOfDate: string, isReceivable: boolean): BillOutstandingItem[] {
    // Bills Receivable: Debtors (Debit bills pending credit payments)
    // Bills Payable: Creditors (Credit bills pending debit payments)
    const targetDebit = isReceivable ? 1 : 0;

    const sql = `
      SELECT
        vba.party_ledger_id,
        l.name AS party_name,
        vba.ref_name,
        vba.ref_type,
        vba.due_date,
        v.date AS bill_date,
        vba.amount AS original_amount,
        COALESCE((
          SELECT SUM(adj.amount)
          FROM voucher_bill_allocation adj
          JOIN voucher av ON adj.voucher_id = av.id AND av.is_cancelled = 0 AND av.is_optional = 0
          WHERE adj.company_id = vba.company_id
            AND adj.party_ledger_id = vba.party_ledger_id
            AND adj.ref_name = vba.ref_name
            AND adj.ref_type = 'Agst Ref'
            AND adj.is_debit != vba.is_debit
            AND av.date <= ?
        ), 0) AS cleared_amount,
        vba.is_debit
      FROM voucher_bill_allocation vba
      JOIN voucher v ON vba.voucher_id = v.id AND v.is_cancelled = 0 AND v.is_optional = 0
      JOIN ledger l ON vba.party_ledger_id = l.id
      WHERE vba.company_id = ?
        AND vba.ref_type IN ('New Ref', 'Advance')
        AND vba.is_debit = ?
        AND v.date <= ?
      ORDER BY v.date ASC, l.name ASC
    `;

    const rows = this.db.prepare(sql).all(asOfDate, companyId, targetDebit, asOfDate) as {
      party_ledger_id: string;
      party_name: string;
      ref_name: string;
      ref_type: string;
      due_date: string | null;
      bill_date: string;
      original_amount: number;
      cleared_amount: number;
      is_debit: number;
    }[];

    const asOfMs = new Date(asOfDate).getTime();

    return rows
      .map((r) => {
        const pending = r.original_amount - r.cleared_amount;
        const refDate = r.due_date || r.bill_date;
        const diffMs = asOfMs - new Date(refDate).getTime();
        const overdueDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        return {
          party_ledger_id: r.party_ledger_id,
          party_name: r.party_name,
          ref_name: r.ref_name,
          ref_type: r.ref_type,
          due_date: r.due_date,
          bill_date: r.bill_date,
          original_amount: r.original_amount,
          cleared_amount: r.cleared_amount,
          pending_amount: pending,
          is_debit: r.is_debit,
          overdue_days: overdueDays,
        };
      })
      .filter((r) => r.pending_amount > 0);
  }

  // Bank Reconciliation (BRS)
  listUnreconciledBankTransactions(companyId: string, bankLedgerId: string): (VoucherBankAllocationRecord & {
    voucher_number: string;
    date: string;
    party_name: string;
  })[] {
    const sql = `
      SELECT
        vba.*,
        v.voucher_number,
        v.date,
        COALESCE(pl.name, 'Sundry') AS party_name
      FROM voucher_bank_allocation vba
      JOIN voucher v ON vba.voucher_id = v.id AND v.is_cancelled = 0 AND v.is_optional = 0
      LEFT JOIN voucher_ledger_entry other_vle ON other_vle.voucher_id = v.id AND other_vle.ledger_id != vba.bank_ledger_id
      LEFT JOIN ledger pl ON other_vle.ledger_id = pl.id
      WHERE vba.company_id = ? AND vba.bank_ledger_id = ? AND vba.bank_date IS NULL
      ORDER BY v.date ASC
    `;
    return this.db.prepare(sql).all(companyId, bankLedgerId) as (VoucherBankAllocationRecord & {
      voucher_number: string;
      date: string;
      party_name: string;
    })[];
  }

  setBankClearanceDate(allocationId: string, clearanceDate: string): void {
    this.db.prepare(`
      UPDATE voucher_bank_allocation
      SET bank_date = ?, cheque_status = 'Cleared'
      WHERE id = ?
    `).run(clearanceDate, allocationId);
  }
}
