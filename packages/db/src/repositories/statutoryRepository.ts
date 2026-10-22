import type { Db } from '../connection.js';
import { newId } from '../ids.js';

export interface ExchangeRateRecord {
  id: string;
  company_id: string;
  currency_id: string;
  rate_date: string;
  rate_type: 'Standard' | 'Selling' | 'Buying';
  rate: number;
  created_at: string;
}

export interface StockItemGstHistoryRecord {
  id: string;
  company_id: string;
  stock_item_id: string;
  applicable_from: string;
  gst_taxability: 'Taxable' | 'Exempt' | 'Nil Rated' | 'Non-GST';
  gst_rate: number;
  cess_rate: number;
  hsn_sac: string;
  created_at: string;
}

export interface PrintTemplateRecord {
  id: string;
  company_id: string;
  name: string;
  template_type: string;
  paper_size: 'A4' | 'A5' | 'Thermal80' | 'Letter';
  copies: number;
  body_html: string;
  is_default: number;
  created_at: string;
}

export interface LockDateRecord {
  id: string;
  company_id: string;
  lock_from: string;
  lock_to: string;
  reason: string;
  created_at: string;
}

export class StatutoryRepository {
  constructor(private readonly db: Db) {}

  // Exchange rates
  listExchangeRates(companyId: string): ExchangeRateRecord[] {
    return this.db
      .prepare(`SELECT * FROM exchange_rate WHERE company_id = ? ORDER BY rate_date DESC`)
      .all(companyId) as ExchangeRateRecord[];
  }

  createExchangeRate(input: {
    companyId: string;
    currencyId: string;
    rateDate: string;
    rateType?: 'Standard' | 'Selling' | 'Buying';
    rate: number;
  }): ExchangeRateRecord {
    const id = newId();
    this.db
      .prepare(`
        INSERT INTO exchange_rate (id, company_id, currency_id, rate_date, rate_type, rate)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, currency_id, rate_date, rate_type)
        DO UPDATE SET rate = excluded.rate
      `)
      .run(
        id,
        input.companyId,
        input.currencyId,
        input.rateDate,
        input.rateType ?? 'Standard',
        input.rate,
      );
    return this.db.prepare(`SELECT * FROM exchange_rate WHERE company_id = ? AND currency_id = ? AND rate_date = ? AND rate_type = ?`)
      .get(input.companyId, input.currencyId, input.rateDate, input.rateType ?? 'Standard') as ExchangeRateRecord;
  }

  // Stock item GST history
  listStockItemGstHistory(companyId: string, stockItemId?: string): StockItemGstHistoryRecord[] {
    const params: unknown[] = [companyId];
    let clause = '';
    if (stockItemId) {
      clause = 'AND stock_item_id = ?';
      params.push(stockItemId);
    }
    return this.db
      .prepare(`SELECT * FROM stock_item_gst_history WHERE company_id = ? ${clause} ORDER BY applicable_from DESC`)
      .all(...params) as StockItemGstHistoryRecord[];
  }

  createStockItemGstHistory(input: {
    companyId: string;
    stockItemId: string;
    applicableFrom: string;
    gstTaxability: 'Taxable' | 'Exempt' | 'Nil Rated' | 'Non-GST';
    gstRate: number;
    cessRate?: number;
    hsnSac?: string;
  }): StockItemGstHistoryRecord {
    const id = newId();
    this.db
      .prepare(`
        INSERT INTO stock_item_gst_history (
          id, company_id, stock_item_id, applicable_from, gst_taxability, gst_rate, cess_rate, hsn_sac
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, stock_item_id, applicable_from)
        DO UPDATE SET gst_taxability = excluded.gst_taxability,
                      gst_rate = excluded.gst_rate,
                      cess_rate = excluded.cess_rate,
                      hsn_sac = excluded.hsn_sac
      `)
      .run(
        id,
        input.companyId,
        input.stockItemId,
        input.applicableFrom,
        input.gstTaxability,
        input.gstRate,
        input.cessRate ?? 0,
        input.hsnSac ?? '',
      );
    return this.db
      .prepare(`SELECT * FROM stock_item_gst_history WHERE id = ?`)
      .get(id) as StockItemGstHistoryRecord;
  }

  /**
   * The GST rate effective for a stock item on a given date.
   */
  getEffectiveGstRate(companyId: string, stockItemId: string, onDate: string) {
    const history = this.listStockItemGstHistory(companyId, stockItemId);
    const applicable = history
      .filter((h) => h.applicable_from <= onDate)
      .sort((a, b) => (a.applicable_from < b.applicable_from ? 1 : -1));

    if (applicable.length > 0) return applicable[0];

    // Fall back to the rate carried on the item itself.
    const item = this.db
      .prepare(`SELECT gst_rate, cess_rate, gst_taxability, hsn_sac FROM stock_item WHERE id = ? AND company_id = ?`)
      .get(stockItemId, companyId) as
      | { gst_rate: number; cess_rate: number; gst_taxability: string; hsn_sac: string }
      | undefined;

    if (!item) return undefined;

    return {
      id: '',
      company_id: companyId,
      stock_item_id: stockItemId,
      applicable_from: '',
      gst_taxability: item.gst_taxability as StockItemGstHistoryRecord['gst_taxability'],
      gst_rate: item.gst_rate,
      cess_rate: item.cess_rate,
      hsn_sac: item.hsn_sac,
      created_at: '',
    };
  }

  // Print templates
  listPrintTemplates(companyId: string): PrintTemplateRecord[] {
    return this.db
      .prepare(`SELECT * FROM print_template WHERE company_id = ? ORDER BY name`)
      .all(companyId) as PrintTemplateRecord[];
  }

  getPrintTemplate(companyId: string, templateId: string): PrintTemplateRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM print_template WHERE id = ? AND company_id = ?`)
      .get(templateId, companyId) as PrintTemplateRecord | undefined;
  }

  getDefaultPrintTemplate(companyId: string, templateType: string): PrintTemplateRecord | undefined {
    return this.db
      .prepare(`
        SELECT * FROM print_template
        WHERE company_id = ? AND template_type = ?
        ORDER BY is_default DESC, name ASC
        LIMIT 1
      `)
      .get(companyId, templateType) as PrintTemplateRecord | undefined;
  }

  createPrintTemplate(input: {
    companyId: string;
    name: string;
    templateType: string;
    paperSize?: 'A4' | 'A5' | 'Thermal80' | 'Letter';
    copies?: number;
    bodyHtml: string;
    isDefault?: boolean;
  }): PrintTemplateRecord {
    const id = newId();
    this.db
      .prepare(`
        INSERT INTO print_template (
          id, company_id, name, template_type, paper_size, copies, body_html, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.companyId,
        input.name.trim(),
        input.templateType,
        input.paperSize ?? 'A4',
        input.copies ?? 1,
        input.bodyHtml,
        input.isDefault ? 1 : 0,
      );
    return this.db.prepare(`SELECT * FROM print_template WHERE id = ?`).get(id) as PrintTemplateRecord;
  }

  // Voucher verification
  verifyVoucher(companyId: string, voucherId: string, verifiedBy: string | undefined, notes = ''): void {
    this.db
      .prepare(`
        INSERT INTO voucher_verification (id, voucher_id, company_id, verified_by, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(voucher_id) DO UPDATE SET verified_by = excluded.verified_by, notes = excluded.notes
      `)
      .run(newId(), voucherId, companyId, verifiedBy ?? null, notes);
  }

  listVerifiedVouchers(companyId: string) {
    return this.db
      .prepare(`
        SELECT vv.*, v.voucher_number, v.date, v.voucher_type_name
        FROM voucher_verification vv
        JOIN voucher v ON v.id = vv.voucher_id
        WHERE vv.company_id = ?
        ORDER BY v.date DESC
      `)
      .all(companyId) as any[];
  }

  isVoucherVerified(voucherId: string): boolean {
    const row = this.db.prepare(`SELECT 1 AS x FROM voucher_verification WHERE voucher_id = ?`).get(voucherId);
    return row !== undefined;
  }

  // Lock dates
  listLockDates(companyId: string): LockDateRecord[] {
    return this.db
      .prepare(`SELECT * FROM lock_date WHERE company_id = ? ORDER BY lock_from DESC`)
      .all(companyId) as LockDateRecord[];
  }

  createLockDate(input: {
    companyId: string;
    lockFrom: string;
    lockTo: string;
    reason?: string;
  }): LockDateRecord {
    const id = newId();
    this.db
      .prepare(`INSERT INTO lock_date (id, company_id, lock_from, lock_to, reason) VALUES (?, ?, ?, ?, ?)`)
      .run(id, input.companyId, input.lockFrom, input.lockTo, input.reason ?? '');
    return this.db.prepare(`SELECT * FROM lock_date WHERE id = ?`).get(id) as LockDateRecord;
  }

  /**
   * Whether a voucher date falls inside a locked period.
   */
  isDateLocked(companyId: string, date: string): boolean {
    const row = this.db
      .prepare(`
        SELECT 1 AS x FROM lock_date
        WHERE company_id = ? AND ? BETWEEN lock_from AND lock_to
      `)
      .get(companyId, date);
    return row !== undefined;
  }
}
