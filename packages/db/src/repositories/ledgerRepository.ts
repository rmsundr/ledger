import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type { GroupNature, LedgerRecord } from '../types.js';

export interface CreateLedgerInput {
  companyId: string;
  name: string;
  alias?: string;
  groupId: string;
  openingBalance?: number; // minor units
  openingIsDebit?: boolean;
  maintainBillByBill?: boolean;
  defaultCreditPeriodDays?: number;
  inventoryValuesAffected?: boolean;
  costCentresApplicable?: boolean;
  mailingName?: string;
  address?: string;
  state?: string;
  country?: string;
  pin?: string;
  phone?: string;
  email?: string;
  pan?: string;
  gstRegistrationType?: string;
  gstin?: string;
  isSystem?: boolean;
}

export interface LedgerWithBalance extends LedgerRecord {
  group_name: string;
  group_nature: GroupNature;
  debit_total: number;
  credit_total: number;
  closing_balance: number;
  closing_is_debit: number;
}

export class LedgerRepository {
  constructor(private readonly db: Db) {}

  getById(id: string): LedgerRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM ledger WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as LedgerRecord | undefined;
  }

  getByName(companyId: string, name: string): LedgerRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM ledger WHERE company_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL`)
      .get(companyId, name) as LedgerRecord | undefined;
  }

  list(companyId: string): (LedgerRecord & { group_name: string; group_nature: GroupNature })[] {
    return this.db
      .prepare(`
        SELECT l.*, g.name AS group_name, g.nature AS group_nature
        FROM ledger l
        JOIN "group" g ON l.group_id = g.id
        WHERE l.company_id = ? AND l.deleted_at IS NULL
        ORDER BY l.name ASC
      `)
      .all(companyId) as (LedgerRecord & { group_name: string; group_nature: GroupNature })[];
  }

  create(input: CreateLedgerInput): LedgerRecord {
    const id = newId();
    this.db.prepare(`
      INSERT INTO ledger (
        id, company_id, name, alias, group_id,
        opening_balance, opening_is_debit, maintain_bill_by_bill,
        default_credit_period_days, inventory_values_affected, cost_centres_applicable,
        mailing_name, address, state, country, pin, phone, email,
        pan, gst_registration_type, gstin, is_system
      ) VALUES (
        @id, @companyId, @name, @alias, @groupId,
        @openingBalance, @openingIsDebit, @maintainBillByBill,
        @defaultCreditPeriodDays, @inventoryValuesAffected, @costCentresApplicable,
        @mailingName, @address, @state, @country, @pin, @phone, @email,
        @pan, @gstRegistrationType, @gstin, @isSystem
      )
    `).run({
      id,
      companyId: input.companyId,
      name: input.name.trim(),
      alias: input.alias?.trim() ?? '',
      groupId: input.groupId,
      openingBalance: input.openingBalance ?? 0,
      openingIsDebit: input.openingIsDebit ?? true ? 1 : 0,
      maintainBillByBill: input.maintainBillByBill ? 1 : 0,
      defaultCreditPeriodDays: input.defaultCreditPeriodDays ?? null,
      inventoryValuesAffected: input.inventoryValuesAffected ? 1 : 0,
      costCentresApplicable: input.costCentresApplicable ? 1 : 0,
      mailingName: input.mailingName?.trim() || input.name.trim(),
      address: input.address ?? '',
      state: input.state ?? '',
      country: input.country ?? 'India',
      pin: input.pin ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      pan: input.pan ?? '',
      gstRegistrationType: input.gstRegistrationType ?? 'Unregistered',
      gstin: input.gstin ?? '',
      isSystem: input.isSystem ? 1 : 0,
    });

    return this.getById(id)!;
  }

  update(id: string, patch: Partial<CreateLedgerInput>): LedgerRecord {
    const sets: string[] = ['updated_at = datetime(\'now\')'];
    const params: Record<string, unknown> = { id };

    if (patch.name !== undefined) {
      sets.push('name = @name');
      params.name = patch.name.trim();
    }
    if (patch.alias !== undefined) {
      sets.push('alias = @alias');
      params.alias = patch.alias.trim();
    }
    if (patch.groupId !== undefined) {
      sets.push('group_id = @groupId');
      params.groupId = patch.groupId;
    }
    if (patch.openingBalance !== undefined) {
      sets.push('opening_balance = @openingBalance');
      params.openingBalance = patch.openingBalance;
    }
    if (patch.openingIsDebit !== undefined) {
      sets.push('opening_is_debit = @openingIsDebit');
      params.openingIsDebit = patch.openingIsDebit ? 1 : 0;
    }
    if (patch.maintainBillByBill !== undefined) {
      sets.push('maintain_bill_by_bill = @maintainBillByBill');
      params.maintainBillByBill = patch.maintainBillByBill ? 1 : 0;
    }
    if (patch.address !== undefined) {
      sets.push('address = @address');
      params.address = patch.address;
    }
    if (patch.state !== undefined) {
      sets.push('state = @state');
      params.state = patch.state;
    }
    if (patch.gstin !== undefined) {
      sets.push('gstin = @gstin');
      params.gstin = patch.gstin;
    }
    if (patch.pan !== undefined) {
      sets.push('pan = @pan');
      params.pan = patch.pan;
    }

    this.db.prepare(`UPDATE ledger SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const hasEntries = this.db.prepare(`SELECT 1 FROM voucher_ledger_entry WHERE ledger_id = ? LIMIT 1`).get(id);
    if (hasEntries) {
      this.db.prepare(`UPDATE ledger SET deleted_at = datetime('now') WHERE id = ?`).run(id);
      return false; // soft-deleted
    }
    this.db.prepare(`DELETE FROM ledger WHERE id = ?`).run(id);
    return true; // hard-deleted
  }

  listWithBalances(companyId: string, asOfDate?: string): LedgerWithBalance[] {
    const dateFilter = asOfDate ? `AND v.date <= ?` : '';
    const params = asOfDate ? [companyId, asOfDate] : [companyId];

    const sql = `
      SELECT
        l.*,
        g.name AS group_name,
        g.nature AS group_nature,
        COALESCE(SUM(CASE WHEN vle.is_debit = 1 THEN vle.amount ELSE 0 END), 0) AS debit_total,
        COALESCE(SUM(CASE WHEN vle.is_debit = 0 THEN vle.amount ELSE 0 END), 0) AS credit_total
      FROM ledger l
      JOIN "group" g ON l.group_id = g.id
      LEFT JOIN voucher_ledger_entry vle ON vle.ledger_id = l.id
      LEFT JOIN voucher v ON v.id = vle.voucher_id AND v.is_cancelled = 0 AND v.is_optional = 0 ${dateFilter}
      WHERE l.company_id = ? AND l.deleted_at IS NULL
      GROUP BY l.id
      ORDER BY g.sort_order, l.name
    `;

    const rows = this.db.prepare(sql).all(...params) as (LedgerRecord & {
      group_name: string;
      group_nature: GroupNature;
      debit_total: number;
      credit_total: number;
    })[];

    return rows.map((r) => {
      // Opening balance: debit is positive, credit is negative
      const opening = r.opening_is_debit === 1 ? r.opening_balance : -r.opening_balance;
      // Net change from vouchers: debits add, credits subtract
      const netChange = r.debit_total - r.credit_total;
      const netClosing = opening + netChange;
      const closing_is_debit = netClosing >= 0 ? 1 : 0;
      const closing_balance = Math.abs(netClosing);

      return {
        ...r,
        closing_balance,
        closing_is_debit,
      };
    });
  }
}
