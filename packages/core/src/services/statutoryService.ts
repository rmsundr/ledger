import type { Db, VoucherGstSummaryRecord } from '@ledgerdesk/db';

export interface GstTaxBreakdown {
  taxableValue: number;
  isInterState: boolean;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  cessAmount: number;
  totalTax: number;
  invoiceTotal: number;
}

export interface Gstr1Summary {
  b2b: {
    gstin: string;
    voucher_number: string;
    date: string;
    taxable_value: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  b2cs: {
    place_of_supply: string;
    taxable_value: number;
    cgst: number;
    sgst: number;
    igst: number;
  }[];
  hsnSummary: {
    hsn_sac: string;
    description: string;
    uqc: string;
    total_qty: number;
    total_value: number;
    taxable_value: number;
    integrated_tax: number;
    central_tax: number;
    state_tax: number;
  }[];
  totalTaxable: number;
  totalTax: number;
}

export class StatutoryService {
  constructor(private readonly db: Db) {}

  calculateGst(params: {
    taxableValue: number; // minor units
    gstRate: number; // e.g. 18 for 18%
    companyState: string;
    partyState: string;
    cessRate?: number;
  }): GstTaxBreakdown {
    const isInterState =
      params.companyState.trim().toLowerCase() !== params.partyState.trim().toLowerCase() &&
      params.partyState.trim() !== '';

    const rate = params.gstRate / 100;
    const cessR = (params.cessRate ?? 0) / 100;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isInterState) {
      igstRate = params.gstRate;
      igstAmount = Math.round(params.taxableValue * rate);
    } else {
      cgstRate = params.gstRate / 2;
      sgstRate = params.gstRate / 2;
      cgstAmount = Math.round(params.taxableValue * (rate / 2));
      sgstAmount = Math.round(params.taxableValue * (rate / 2));
    }

    const cessAmount = Math.round(params.taxableValue * cessR);
    const totalTax = cgstAmount + sgstAmount + igstAmount + cessAmount;
    const invoiceTotal = params.taxableValue + totalTax;

    return {
      taxableValue: params.taxableValue,
      isInterState,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      cessAmount,
      totalTax,
      invoiceTotal,
    };
  }

  getGstr1Report(companyId: string, fromDate: string, toDate: string): Gstr1Summary {
    const sql = `
      SELECT
        v.id AS voucher_id,
        v.voucher_number,
        v.date,
        l.gstin,
        l.state AS party_state,
        g.*
      FROM voucher_gst_summary g
      JOIN voucher v ON g.voucher_id = v.id AND v.is_cancelled = 0 AND v.is_optional = 0
      JOIN voucher_ledger_entry vle ON vle.voucher_id = v.id AND vle.entry_index = 0
      JOIN ledger l ON vle.ledger_id = l.id
      WHERE g.company_id = ?
        AND v.voucher_type_name IN ('Sales', 'Credit Note', 'Debit Note')
        AND v.date >= ? AND v.date <= ?
      ORDER BY v.date ASC
    `;

    const rows = this.db.prepare(sql).all(companyId, fromDate, toDate) as (VoucherGstSummaryRecord & {
      voucher_number: string;
      date: string;
      gstin: string;
      party_state: string;
    })[];

    const b2b: Gstr1Summary['b2b'] = [];
    const b2csMap = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();

    let totalTaxable = 0;
    let totalTax = 0;

    for (const r of rows) {
      totalTaxable += r.taxable_value;
      const tax = r.cgst_amount + r.sgst_amount + r.igst_amount + r.cess_amount;
      totalTax += tax;

      if (r.gstin && r.gstin.trim().length === 15) {
        b2b.push({
          gstin: r.gstin,
          voucher_number: r.voucher_number,
          date: r.date,
          taxable_value: r.taxable_value,
          cgst: r.cgst_amount,
          sgst: r.sgst_amount,
          igst: r.igst_amount,
          total: r.taxable_value + tax,
        });
      } else {
        const pos = r.place_of_supply || r.party_state || 'Other';
        const existing = b2csMap.get(pos) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        existing.taxable += r.taxable_value;
        existing.cgst += r.cgst_amount;
        existing.sgst += r.sgst_amount;
        existing.igst += r.igst_amount;
        b2csMap.set(pos, existing);
      }
    }

    const b2cs = Array.from(b2csMap.entries()).map(([pos, data]) => ({
      place_of_supply: pos,
      taxable_value: data.taxable,
      cgst: data.cgst,
      sgst: data.sgst,
      igst: data.igst,
    }));

    return {
      b2b,
      b2cs,
      hsnSummary: [],
      totalTaxable,
      totalTax,
    };
  }
}
