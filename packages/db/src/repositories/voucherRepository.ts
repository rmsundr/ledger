import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type {
  VoucherBankAllocationRecord,
  VoucherBillAllocationRecord,
  VoucherCostAllocationRecord,
  VoucherGstSummaryRecord,
  VoucherInventoryEntryRecord,
  VoucherLedgerEntryRecord,
  VoucherRecord,
  VoucherTdsEntryRecord,
  VoucherTypeRecord,
} from '../types.js';

export interface CreateVoucherInput {
  companyId: string;
  voucherTypeId: string;
  voucherTypeName: string;
  voucherNumber?: string;
  date: string; // YYYY-MM-DD
  effectiveDate?: string;
  referenceNo?: string;
  referenceDate?: string;
  narration?: string;
  isInvoice?: boolean;
  isOptional?: boolean;
  isPostDated?: boolean;
  guid?: string;
  alterId?: string;

  ledgerEntries: {
    ledgerId: string;
    isDebit: boolean;
    amount: number; // minor units (paise)
    narration?: string;
  }[];

  billAllocations?: {
    entryIndex: number;
    partyLedgerId: string;
    refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
    refName: string;
    amount: number;
    isDebit: boolean;
    dueDate?: string;
  }[];

  costAllocations?: {
    entryIndex: number;
    costCentreId: string;
    amount: number;
  }[];

  bankAllocations?: {
    entryIndex: number;
    bankLedgerId: string;
    transactionType: 'Cheque' | 'DD' | 'ECS' | 'NEFT' | 'RTGS' | 'UPI' | 'Others';
    instrumentNo?: string;
    instrumentDate?: string;
    bankName?: string;
    amount: number;
    chequeStatus?: 'Uncleared' | 'Cleared' | 'Bounced';
    bankDate?: string;
  }[];

  inventoryEntries?: {
    stockItemId: string;
    godownId?: string;
    batchId?: string;
    entryType: 'Inward' | 'Outward' | 'Transfer_Source' | 'Transfer_Dest';
    quantity: number;
    actualQuantity?: number;
    rate: number;
    discountPercent?: number;
    amount: number;
    trackingNumber?: string;
    orderNumber?: string;
  }[];

  gstSummary?: {
    placeOfSupply?: string;
    isInterState?: boolean;
    isRcm?: boolean;
    taxableValue?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    cessAmount?: number;
    hsnSummaryJson?: string;
    irn?: string;
    ackNo?: string;
    ackDate?: string;
    qrCode?: string;
    ewayBillNo?: string;
    ewayBillDate?: string;
  };

  tdsEntry?: {
    partyLedgerId: string;
    tdsLedgerId: string;
    section: string;
    natureOfPayment: string;
    deducteePan?: string;
    grossAmount: number;
    rate: number;
    tdsAmount: number;
    challanNo?: string;
    bsrCode?: string;
    depositDate?: string;
  };
}

export interface FullVoucher extends VoucherRecord {
  ledger_entries: (VoucherLedgerEntryRecord & { ledger_name: string })[];
  bill_allocations: VoucherBillAllocationRecord[];
  cost_allocations: VoucherCostAllocationRecord[];
  bank_allocations: VoucherBankAllocationRecord[];
  inventory_entries: (VoucherInventoryEntryRecord & { stock_item_name?: string })[];
  gst_summary?: VoucherGstSummaryRecord;
  tds_entry?: VoucherTdsEntryRecord;
}

export class VoucherRepository {
  constructor(private readonly db: Db) {}

  getNextVoucherNumber(companyId: string, voucherTypeId: string, date: string): string {
    const vt = this.db
      .prepare(`SELECT * FROM voucher_type WHERE id = ? AND company_id = ?`)
      .get(voucherTypeId, companyId) as VoucherTypeRecord | undefined;

    if (!vt || vt.numbering_method === 'Manual') {
      return '';
    }

    let periodKey = '';
    if (vt.restart_numbering === 'Yearly') {
      periodKey = date.slice(0, 4); // '2025'
    } else if (vt.restart_numbering === 'Monthly') {
      periodKey = date.slice(0, 7); // '2025-04'
    } else if (vt.restart_numbering === 'Daily') {
      periodKey = date; // '2025-04-01'
    }

    const row = this.db
      .prepare(`
        SELECT last_number FROM voucher_number_sequence
        WHERE company_id = ? AND voucher_type_id = ? AND period_key = ?
      `)
      .get(companyId, voucherTypeId, periodKey) as { last_number: number } | undefined;

    const nextNum = (row?.last_number ?? 0) + 1;
    return `${vt.prefix}${nextNum}${vt.suffix}`;
  }

  createVoucher(input: CreateVoucherInput): FullVoucher {
    const run = this.db.transaction(() => {
      // 1. Double-entry integrity check
      let sumDebit = 0;
      let sumCredit = 0;

      for (const entry of input.ledgerEntries) {
        if (entry.amount < 0) {
          throw new Error(`Negative amount not allowed in ledger entry: ${entry.amount}`);
        }
        if (entry.isDebit) {
          sumDebit += entry.amount;
        } else {
          sumCredit += entry.amount;
        }
      }

      if (input.ledgerEntries.length > 0 && sumDebit !== sumCredit) {
        throw new Error(
          `Accounting entries out of balance! Total Debit (${sumDebit}) does not equal Total Credit (${sumCredit}). Difference: ${sumDebit - sumCredit}`,
        );
      }

      const totalAmount = sumDebit;
      const voucherId = newId();

      // Resolve voucher number
      let voucherNumber = input.voucherNumber?.trim();
      if (!voucherNumber) {
        voucherNumber = this.getNextVoucherNumber(input.companyId, input.voucherTypeId, input.date);
        if (!voucherNumber) {
          voucherNumber = '1';
        }
      }

      // Update sequence
      const vt = this.db
        .prepare(`SELECT * FROM voucher_type WHERE id = ?`)
        .get(input.voucherTypeId) as VoucherTypeRecord | undefined;

      let periodKey = '';
      if (vt?.restart_numbering === 'Yearly') {
        periodKey = input.date.slice(0, 4);
      } else if (vt?.restart_numbering === 'Monthly') {
        periodKey = input.date.slice(0, 7);
      } else if (vt?.restart_numbering === 'Daily') {
        periodKey = input.date;
      }

      // Extract numeric suffix from voucherNumber to update sequence if automatic
      const numericPart = parseInt(voucherNumber.replace(/\D/g, ''), 10);
      if (!Number.isNaN(numericPart)) {
        this.db.prepare(`
          INSERT INTO voucher_number_sequence (company_id, voucher_type_id, period_key, last_number)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(company_id, voucher_type_id, period_key)
          DO UPDATE SET last_number = MAX(last_number, excluded.last_number)
        `).run(input.companyId, input.voucherTypeId, periodKey, numericPart);
      }

      // 2. Insert voucher header
      this.db.prepare(`
        INSERT INTO voucher (
          id, company_id, voucher_type_id, voucher_type_name, voucher_number,
          date, effective_date, reference_no, reference_date, narration,
          is_invoice, is_optional, is_post_dated, is_cancelled, total_amount,
          guid, alter_id
        ) VALUES (
          @id, @companyId, @voucherTypeId, @voucherTypeName, @voucherNumber,
          @date, @effectiveDate, @referenceNo, @referenceDate, @narration,
          @isInvoice, @isOptional, @isPostDated, 0, @totalAmount,
          @guid, @alterId
        )
      `).run({
        id: voucherId,
        companyId: input.companyId,
        voucherTypeId: input.voucherTypeId,
        voucherTypeName: input.voucherTypeName,
        voucherNumber,
        date: input.date,
        effectiveDate: input.effectiveDate ?? null,
        referenceNo: input.referenceNo ?? '',
        referenceDate: input.referenceDate ?? null,
        narration: input.narration ?? '',
        isInvoice: input.isInvoice ? 1 : 0,
        isOptional: input.isOptional ? 1 : 0,
        isPostDated: input.isPostDated ? 1 : 0,
        totalAmount,
        guid: input.guid ?? null,
        alterId: input.alterId ?? null,
      });

      // 3. Insert ledger entries
      const insertVle = this.db.prepare(`
        INSERT INTO voucher_ledger_entry (
          id, voucher_id, company_id, ledger_id, entry_index, is_debit, amount, narration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const entryIds: string[] = [];
      input.ledgerEntries.forEach((e, idx) => {
        const entryId = newId();
        entryIds.push(entryId);
        insertVle.run(
          entryId,
          voucherId,
          input.companyId,
          e.ledgerId,
          idx,
          e.isDebit ? 1 : 0,
          e.amount,
          e.narration ?? '',
        );
      });

      // 4. Bill Allocations
      if (input.billAllocations && input.billAllocations.length > 0) {
        const insertVba = this.db.prepare(`
          INSERT INTO voucher_bill_allocation (
            id, voucher_id, voucher_ledger_entry_id, company_id,
            party_ledger_id, ref_type, ref_name, amount, is_debit, due_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ba of input.billAllocations) {
          const vleId = entryIds[ba.entryIndex] || entryIds[0];
          insertVba.run(
            newId(),
            voucherId,
            vleId,
            input.companyId,
            ba.partyLedgerId,
            ba.refType,
            ba.refName,
            ba.amount,
            ba.isDebit ? 1 : 0,
            ba.dueDate ?? null,
          );
        }
      }

      // 5. Cost Allocations
      if (input.costAllocations && input.costAllocations.length > 0) {
        const insertVca = this.db.prepare(`
          INSERT INTO voucher_cost_allocation (
            id, voucher_id, voucher_ledger_entry_id, company_id, cost_centre_id, amount
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const ca of input.costAllocations) {
          const vleId = entryIds[ca.entryIndex] || entryIds[0];
          insertVca.run(newId(), voucherId, vleId, input.companyId, ca.costCentreId, ca.amount);
        }
      }

      // 6. Bank Allocations
      if (input.bankAllocations && input.bankAllocations.length > 0) {
        const insertBank = this.db.prepare(`
          INSERT INTO voucher_bank_allocation (
            id, voucher_id, voucher_ledger_entry_id, company_id, bank_ledger_id,
            transaction_type, instrument_no, instrument_date, bank_name,
            amount, cheque_status, bank_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of input.bankAllocations) {
          const vleId = entryIds[b.entryIndex] || entryIds[0];
          insertBank.run(
            newId(),
            voucherId,
            vleId,
            input.companyId,
            b.bankLedgerId,
            b.transactionType,
            b.instrumentNo ?? '',
            b.instrumentDate ?? null,
            b.bankName ?? '',
            b.amount,
            b.chequeStatus ?? 'Uncleared',
            b.bankDate ?? null,
          );
        }
      }

      // 7. Inventory Entries
      if (input.inventoryEntries && input.inventoryEntries.length > 0) {
        const insertVie = this.db.prepare(`
          INSERT INTO voucher_inventory_entry (
            id, voucher_id, company_id, stock_item_id, godown_id, batch_id,
            entry_type, quantity, actual_quantity, rate, discount_percent, amount,
            tracking_number, order_number, entry_index
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertStockLedger = this.db.prepare(`
          INSERT INTO stock_ledger (
            id, company_id, voucher_id, date, stock_item_id, godown_id, batch_id,
            inward_qty, outward_qty, rate, value
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        input.inventoryEntries.forEach((ie, idx) => {
          const vieId = newId();
          insertVie.run(
            vieId,
            voucherId,
            input.companyId,
            ie.stockItemId,
            ie.godownId ?? null,
            ie.batchId ?? null,
            ie.entryType,
            ie.quantity,
            ie.actualQuantity ?? null,
            ie.rate,
            ie.discountPercent ?? 0,
            ie.amount,
            ie.trackingNumber ?? '',
            ie.orderNumber ?? '',
            idx,
          );

          // Maintain stock ledger
          const inward = ie.entryType === 'Inward' || ie.entryType === 'Transfer_Dest' ? ie.quantity : 0;
          const outward = ie.entryType === 'Outward' || ie.entryType === 'Transfer_Source' ? ie.quantity : 0;
          insertStockLedger.run(
            newId(),
            input.companyId,
            voucherId,
            input.date,
            ie.stockItemId,
            ie.godownId ?? null,
            ie.batchId ?? null,
            inward,
            outward,
            ie.rate,
            ie.amount,
          );
        });
      }

      // 8. GST Summary
      if (input.gstSummary) {
        this.db.prepare(`
          INSERT INTO voucher_gst_summary (
            id, voucher_id, company_id, place_of_supply, is_inter_state, is_rcm,
            taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount,
            hsn_summary_json, irn, ack_no, ack_date, qr_code, eway_bill_no, eway_bill_date
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?
          )
        `).run(
          newId(),
          voucherId,
          input.companyId,
          input.gstSummary.placeOfSupply ?? '',
          input.gstSummary.isInterState ? 1 : 0,
          input.gstSummary.isRcm ? 1 : 0,
          input.gstSummary.taxableValue ?? 0,
          input.gstSummary.cgstAmount ?? 0,
          input.gstSummary.sgstAmount ?? 0,
          input.gstSummary.igstAmount ?? 0,
          input.gstSummary.cessAmount ?? 0,
          input.gstSummary.hsnSummaryJson ?? '[]',
          input.gstSummary.irn ?? null,
          input.gstSummary.ackNo ?? null,
          input.gstSummary.ackDate ?? null,
          input.gstSummary.qrCode ?? null,
          input.gstSummary.ewayBillNo ?? null,
          input.gstSummary.ewayBillDate ?? null,
        );
      }

      // 9. TDS Entry
      if (input.tdsEntry) {
        this.db.prepare(`
          INSERT INTO voucher_tds_entry (
            id, voucher_id, company_id, party_ledger_id, tds_ledger_id,
            section, nature_of_payment, deductee_pan, gross_amount, rate, tds_amount,
            challan_no, bsr_code, deposit_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newId(),
          voucherId,
          input.companyId,
          input.tdsEntry.partyLedgerId,
          input.tdsEntry.tdsLedgerId,
          input.tdsEntry.section,
          input.tdsEntry.natureOfPayment,
          input.tdsEntry.deducteePan ?? '',
          input.tdsEntry.grossAmount,
          input.tdsEntry.rate,
          input.tdsEntry.tdsAmount,
          input.tdsEntry.challanNo ?? null,
          input.tdsEntry.bsrCode ?? null,
          input.tdsEntry.depositDate ?? null,
        );
      }

      return voucherId;
    });

    const id = run();
    return this.getById(id)!;
  }

  getById(id: string): FullVoucher | undefined {
    const voucher = this.db
      .prepare(`SELECT * FROM voucher WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as VoucherRecord | undefined;

    if (!voucher) return undefined;

    const ledger_entries = this.db
      .prepare(`
        SELECT vle.*, l.name AS ledger_name
        FROM voucher_ledger_entry vle
        JOIN ledger l ON vle.ledger_id = l.id
        WHERE vle.voucher_id = ?
        ORDER BY vle.entry_index ASC
      `)
      .all(id) as (VoucherLedgerEntryRecord & { ledger_name: string })[];

    const bill_allocations = this.db
      .prepare(`SELECT * FROM voucher_bill_allocation WHERE voucher_id = ?`)
      .all(id) as VoucherBillAllocationRecord[];

    const cost_allocations = this.db
      .prepare(`SELECT * FROM voucher_cost_allocation WHERE voucher_id = ?`)
      .all(id) as VoucherCostAllocationRecord[];

    const bank_allocations = this.db
      .prepare(`SELECT * FROM voucher_bank_allocation WHERE voucher_id = ?`)
      .all(id) as VoucherBankAllocationRecord[];

    const inventory_entries = this.db
      .prepare(`
        SELECT vie.*, si.name AS stock_item_name
        FROM voucher_inventory_entry vie
        JOIN stock_item si ON vie.stock_item_id = si.id
        WHERE vie.voucher_id = ?
        ORDER BY vie.entry_index ASC
      `)
      .all(id) as (VoucherInventoryEntryRecord & { stock_item_name?: string })[];

    const gst_summary = this.db
      .prepare(`SELECT * FROM voucher_gst_summary WHERE voucher_id = ?`)
      .get(id) as VoucherGstSummaryRecord | undefined;

    const tds_entry = this.db
      .prepare(`SELECT * FROM voucher_tds_entry WHERE voucher_id = ?`)
      .get(id) as VoucherTdsEntryRecord | undefined;

    return {
      ...voucher,
      ledger_entries,
      bill_allocations,
      cost_allocations,
      bank_allocations,
      inventory_entries,
      gst_summary,
      tds_entry,
    };
  }

  list(
    companyId: string,
    filter?: { fromDate?: string; toDate?: string; voucherTypeId?: string },
  ): (VoucherRecord & { party_ledger?: string })[] {
    const conditions: string[] = ['v.company_id = ?', 'v.deleted_at IS NULL'];
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
      SELECT v.*,
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

    return this.db.prepare(sql).all(...params) as (VoucherRecord & { party_ledger?: string })[];
  }

  cancelVoucher(id: string): void {
    this.db.prepare(`UPDATE voucher SET is_cancelled = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  }

  deleteVoucher(id: string): void {
    this.db.prepare(`UPDATE voucher SET deleted_at = datetime('now') WHERE id = ?`).run(id);
  }
}
