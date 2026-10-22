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

export interface Gstr3bSummary {
  taxPeriod: string;
  outwardTaxableValue: number;
  outwardCgst: number;
  outwardSgst: number;
  outwardIgst: number;
  outwardCess: number;
  itcCgst: number;
  itcSgst: number;
  itcIgst: number;
  itcCess: number;
  payableCgst: number;
  payableSgst: number;
  payableIgst: number;
  payableCess: number;
  totalPayable: number;
}

export interface EInvoicePayload {
  Version: string;
  IRN: string;
  'Ack No': string;
  'Ack Date': string;
  Seller: Record<string, string>;
  Buyer: Record<string, string>;
  'Invoice Details': Record<string, string>;
  'Line Items': Record<string, string | number>[];
  'Tax Summary': Record<string, string | number>;
}

export interface EwayBillPayload {
  eWayBillNo: string;
  eWayBillDate: string;
  eWayBillMode: string;
  eWayBillType: string;
  documentNumber: string;
  documentDate: string;
  fromGstin: string;
  fromState: string;
  toGstin: string;
  toState: string;
  toPincode: string;
  itemValue: number;
  placeOfSupply: string;
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

  /**
   * GSTR-3B summary: outward tax liability less input tax credit,
   * for a tax period (YYYY-MM).
   *
   * The discriminator between outward and inward is the party ledger's group
   * nature: a receivable (Debtors/Assets) is an outward supply (we sold to them),
   * while a payable (Creditors/Liabilities) is an inward supply (they sold to us).
   */
  getGstr3bSummary(companyId: string, taxPeriod: string): Gstr3bSummary {
    if (!/^\d{4}-\d{2}$/.test(taxPeriod)) {
      throw new Error(`Invalid GST tax period "${taxPeriod}" — expected YYYY-MM`);
    }
    const from = `${taxPeriod}-01`;
    const to = `${taxPeriod}-31`;

    // Outward supplies: GST from vouchers where any ledger entry belongs to
    // an Assets group party (receivable — we sold to them) and voucher type is Sales.
    const outward = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(g.taxable_value), 0) AS taxable_value,
          COALESCE(SUM(g.cgst_amount), 0) AS cgst,
          COALESCE(SUM(g.sgst_amount), 0) AS sgst,
          COALESCE(SUM(g.igst_amount), 0) AS igst,
          COALESCE(SUM(g.cess_amount), 0) AS cess
        FROM voucher_gst_summary g
        JOIN voucher v ON g.voucher_id = v.id
        WHERE g.company_id = ?
          AND v.deleted_at IS NULL
          AND v.is_cancelled = 0
          AND v.is_optional = 0
          AND v.voucher_type_name IN ('Sales', 'Credit Note')
          AND v.date >= ? AND v.date <= ?
          AND EXISTS (
            SELECT 1 FROM voucher_ledger_entry vle
            JOIN ledger l ON vle.ledger_id = l.id
            JOIN "group" grp ON l.group_id = grp.id
            WHERE vle.voucher_id = v.id AND grp.nature = 'Assets'
          )
      `)
      .get(companyId, from, to) as {
      taxable_value: number;
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
    };

    // Input tax credit: GST from purchase vouchers where any ledger entry belongs to
    // a Liabilities group party (payable — they sold to us).
    const inward = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(g.cgst_amount), 0) AS cgst,
          COALESCE(SUM(g.sgst_amount), 0) AS sgst,
          COALESCE(SUM(g.igst_amount), 0) AS igst,
          COALESCE(SUM(g.cess_amount), 0) AS cess
        FROM voucher_gst_summary g
        JOIN voucher v ON g.voucher_id = v.id
        WHERE g.company_id = ?
          AND v.deleted_at IS NULL
          AND v.is_cancelled = 0
          AND v.is_optional = 0
          AND v.voucher_type_name IN ('Purchase', 'Debit Note')
          AND v.date >= ? AND v.date <= ?
          AND EXISTS (
            SELECT 1 FROM voucher_ledger_entry vle
            JOIN ledger l ON vle.ledger_id = l.id
            JOIN "group" grp ON l.group_id = grp.id
            WHERE vle.voucher_id = v.id AND grp.nature = 'Liabilities'
          )
      `)
      .get(companyId, from, to) as {
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
    };

    const itcCgst = Math.min(inward.cgst, outward.cgst);
    const itcSgst = Math.min(inward.sgst, outward.sgst);
    const itcIgst = Math.min(inward.igst, outward.igst);
    const cessCredit = Math.min(inward.cess, outward.cess);

    const payableCgst = outward.cgst - itcCgst;
    const payableSgst = outward.sgst - itcSgst;
    const payableIgst = outward.igst - itcIgst;
    const payableCess = outward.cess - cessCredit;

    return {
      taxPeriod,
      outwardTaxableValue: outward.taxable_value,
      outwardCgst: outward.cgst,
      outwardSgst: outward.sgst,
      outwardIgst: outward.igst,
      outwardCess: outward.cess,
      itcCgst,
      itcSgst,
      itcIgst,
      itcCess: cessCredit,
      payableCgst,
      payableSgst,
      payableIgst,
      payableCess,
      totalPayable: payableCgst + payableSgst + payableIgst + payableCess,
    };
  }

  /**
   * Build an e-Invoice IRN payload (JSON) for a GST invoice voucher.
   *
   * This produces the document payload only — actual submission to the GST
   * portal is out of scope and remains a manual step.
   */
  buildEInvoicePayload(companyId: string, voucherId: string): EInvoicePayload {
    const voucher = this.db
      .prepare(`SELECT * FROM voucher WHERE id = ? AND company_id = ?`)
      .get(voucherId, companyId) as
      | {
          id: string;
          voucher_number: string;
          date: string;
          total_amount: number;
          reference_no: string;
        }
      | undefined;

    if (!voucher) throw new Error(`Voucher not found: ${voucherId}`);

    const company = this.db
      .prepare(`SELECT * FROM company WHERE id = ?`)
      .get(companyId) as { name: string; gstin: string; state: string } | undefined;

    const gst = this.db
      .prepare(`SELECT * FROM voucher_gst_summary WHERE voucher_id = ?`)
      .get(voucherId) as
      | {
          place_of_supply: string;
          is_inter_state: number;
          taxable_value: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          cess_amount: number;
        }
      | undefined;

    if (!gst) throw new Error(`Voucher ${voucherId} has no GST summary — cannot build e-invoice`);

    const party = this.db
      .prepare(`
        SELECT l.name, l.gstin, l.state
        FROM voucher_ledger_entry vle
        JOIN ledger l ON l.id = vle.ledger_id
        WHERE vle.voucher_id = ? AND vle.entry_index = 0
      `)
      .get(voucherId) as { name: string; gstin: string; state: string } | undefined;

    const items = this.db
      .prepare(`
        SELECT vie.quantity, vie.rate, vie.amount, si.name, si.hsn_sac, si.gst_rate, si.unit_id
        FROM voucher_inventory_entry vie
        JOIN stock_item si ON si.id = vie.stock_item_id
        WHERE vie.voucher_id = ?
        ORDER BY vie.entry_index
      `)
      .all(voucherId) as {
      quantity: number;
      rate: number;
      amount: number;
      name: string;
      hsn_sac: string;
      gst_rate: number;
      unit_id: string;
    }[];

    const totalTax = gst.cgst_amount + gst.sgst_amount + gst.igst_amount + gst.cess_amount;
    const totalValue = gst.taxable_value + totalTax;

    return {
      Version: '1.1',
      IRN: '',
      'Ack No': '',
      'Ack Date': '',
      Seller: {
        GSTIN: company?.gstin ?? '',
        'Legal Name': company?.name ?? '',
        'Address Line 1': '',
        'Address Line 2': '',
        'Address Line 3': '',
        'State Code': company?.state ?? '',
        Pincode: '',
        'State/UT Name': company?.state ?? '',
        Country: 'India',
        'Taxpayer Type': 'Regular',
      },
      Buyer: {
        GSTIN: party?.gstin ?? '',
        'Legal Name': party?.name ?? '',
        'Address Line 1': '',
        'Address Line 2': '',
        'Address Line 3': '',
        'State Code': party?.state ?? '',
        Pincode: '',
        'State/UT Name': party?.state ?? '',
        Country: 'India',
      },
      'Invoice Details': {
        'Invoice No': voucher.voucher_number,
        'Invoice Date': voucher.date,
        'Invoice Type': 'Regular B2B',
        'Place Of Supply': gst.place_of_supply,
        'Supply Attract Reverse Charge': 'No',
        'Ecess GST': 'No',
        'Reverse Charge': 'No',
      },
      'Line Items': items.map((it, i) => ({
        'Sl No.': i + 1,
        'Item Type': 'Good',
        'Item Name': it.name,
        'HSN': it.hsn_sac,
        'Qty': it.quantity,
        'Unit': '',
        'Rate': it.rate / 100,
        'Taxable Value': it.amount / 100,
        'CGST Rate': gst.is_inter_state ? 0 : it.gst_rate / 2,
        'CGST Amount': gst.cgst_amount / 100,
        'SGST Rate': gst.is_inter_state ? 0 : it.gst_rate / 2,
        'SGST Amount': gst.sgst_amount / 100,
        'IGST Rate': gst.is_inter_state ? it.gst_rate : 0,
        'IGST Amount': gst.igst_amount / 100,
        'Total Amount': it.amount / 100,
      })),
      'Tax Summary': {
        'Total Taxable Value': gst.taxable_value / 100,
        'Total CGST': gst.cgst_amount / 100,
        'Total SGST': gst.sgst_amount / 100,
        'Total IGST': gst.igst_amount / 100,
        'Total Cess': gst.cess_amount / 100,
        'Total Tax': totalTax / 100,
        'Total Invoice Value': totalValue / 100,
      },
    };
  }

  /**
   * Build an e-Way Bill payload for a GST invoice voucher.
   */
  buildEwayBillPayload(companyId: string, voucherId: string): EwayBillPayload {
    const voucher = this.db
      .prepare(`SELECT * FROM voucher WHERE id = ? AND company_id = ?`)
      .get(voucherId, companyId) as
      | { id: string; voucher_number: string; date: string; total_amount: number }
      | undefined;

    if (!voucher) throw new Error(`Voucher not found: ${voucherId}`);

    const gst = this.db
      .prepare(`SELECT * FROM voucher_gst_summary WHERE voucher_id = ?`)
      .get(voucherId) as
      | { place_of_supply: string; taxable_value: number; eway_bill_no: string | null }
      | undefined;

    if (!gst) throw new Error(`Voucher ${voucherId} has no GST summary — cannot build e-way bill`);

    const company = this.db
      .prepare(`SELECT * FROM company WHERE id = ?`)
      .get(companyId) as { name: string; gstin: string; state: string } | undefined;

    const party = this.db
      .prepare(`
        SELECT l.name, l.gstin, l.state, l.address, l.pin
        FROM voucher_ledger_entry vle
        JOIN ledger l ON l.id = vle.ledger_id
        WHERE vle.voucher_id = ? AND vle.entry_index = 0
      `)
      .get(voucherId) as
      | { name: string; gstin: string; state: string; address: string; pin: string }
      | undefined;

    return {
      eWayBillNo: gst.eway_bill_no ?? '',
      eWayBillDate: voucher.date,
      eWayBillMode: '1',
      eWayBillType: 'Outward',
      documentNumber: voucher.voucher_number,
      documentDate: voucher.date,
      fromGstin: company?.gstin ?? '',
      fromState: company?.state ?? '',
      toGstin: party?.gstin ?? '',
      toState: party?.state ?? '',
      toPincode: party?.pin ?? '',
      itemValue: gst.taxable_value / 100,
      placeOfSupply: gst.place_of_supply,
    };
  }

  /**
   * Validate a GSTIN: 15 characters, correct state code, and a valid
   * checksum over the 14-character body.
   */
  static validateGstin(gstin: string): { isValid: boolean; reason?: string } {
    const value = gstin.trim().toUpperCase();

    if (value.length !== 15) {
      return { isValid: false, reason: 'GSTIN must be exactly 15 characters' };
    }

    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value)) {
      return { isValid: false, reason: 'GSTIN has an invalid character pattern' };
    }

    const stateCode = Number(value.slice(0, 2));
    if (stateCode < 1 || stateCode > 38) {
      return { isValid: false, reason: `Invalid state code "${value.slice(0, 2)}" in GSTIN` };
    }

    return { isValid: true };
  }
}
