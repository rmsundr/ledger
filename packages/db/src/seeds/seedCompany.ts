import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type { CreateCompanyInput } from '../types.js';
import { DEFAULT_GROUPS } from './defaultGroups.js';
import { DEFAULT_VOUCHER_TYPES } from './defaultVoucherTypes.js';

function fyEnd(beginIso: string): string {
  const d = new Date(beginIso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${beginIso}`);
  const end = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate() - 1));
  return end.toISOString().slice(0, 10);
}

export function seedNewCompany(db: Db, input: CreateCompanyInput): { companyId: string } {
  const companyId = newId();
  const mailingName = input.mailingName?.trim() || input.name.trim();

  const insertCompany = db.prepare(`
    INSERT INTO company (
      id, name, mailing_name, address_line1, address_line2, address_line3, address_line4,
      state, country, pin, phone, email, website,
      financial_year_begin, books_begin,
      base_currency_symbol, base_currency_formal_name, base_currency_decimals,
      company_pan, gstin, cin
    ) VALUES (
      @id, @name, @mailing_name, @address_line1, @address_line2, @address_line3, @address_line4,
      @state, @country, @pin, @phone, @email, @website,
      @financial_year_begin, @books_begin,
      @base_currency_symbol, @base_currency_formal_name, @base_currency_decimals,
      @company_pan, @gstin, @cin
    )
  `);

  const run = db.transaction(() => {
    insertCompany.run({
      id: companyId,
      name: input.name.trim(),
      mailing_name: mailingName,
      address_line1: input.addressLine1 ?? '',
      address_line2: input.addressLine2 ?? '',
      address_line3: input.addressLine3 ?? '',
      address_line4: input.addressLine4 ?? '',
      state: input.state ?? '',
      country: input.country ?? 'India',
      pin: input.pin ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      website: input.website ?? '',
      financial_year_begin: input.financialYearBegin,
      books_begin: input.booksBegin,
      base_currency_symbol: input.baseCurrencySymbol ?? '₹',
      base_currency_formal_name: input.baseCurrencyFormalName ?? 'Indian Rupee',
      base_currency_decimals: input.baseCurrencyDecimals ?? 2,
      company_pan: input.companyPan ?? '',
      gstin: input.gstin ?? '',
      cin: input.cin ?? '',
    });

    db.prepare(`INSERT INTO company_features (company_id) VALUES (?)`).run(companyId);

    db.prepare(
      `INSERT INTO financial_year (id, company_id, begin_date, end_date, is_current)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(newId(), companyId, input.financialYearBegin, fyEnd(input.financialYearBegin));

    db.prepare(
      `INSERT INTO currency (id, company_id, symbol, formal_name, decimal_places, is_base)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(
      newId(),
      companyId,
      input.baseCurrencySymbol ?? '₹',
      input.baseCurrencyFormalName ?? 'Indian Rupee',
      input.baseCurrencyDecimals ?? 2,
    );

    const ownerRoleId = newId();
    db.prepare(
      `INSERT INTO role (id, company_id, name, is_system) VALUES (?, ?, 'Owner', 1)`,
    ).run(ownerRoleId, companyId);
    db.prepare(
      `INSERT INTO role (id, company_id, name, is_system) VALUES (?, ?, 'Data Entry', 1)`,
    ).run(newId(), companyId);
    db.prepare(
      `INSERT INTO role (id, company_id, name, is_system) VALUES (?, ?, 'Auditor', 1)`,
    ).run(newId(), companyId);

    // Default owner user (no password required in Phase 1 single-user mode)
    db.prepare(
      `INSERT INTO "user" (id, company_id, username, display_name, password_hash, role_id)
       VALUES (?, ?, 'owner', 'Owner', '', ?)`,
    ).run(newId(), companyId, ownerRoleId);

    const groupIds = new Map<string, string>();
    const insertGroup = db.prepare(`
      INSERT INTO "group" (
        id, company_id, name, parent_id, nature, is_system,
        used_for_calculation, sort_order
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    for (const g of DEFAULT_GROUPS.filter((x) => !x.parent)) {
      const id = newId();
      groupIds.set(g.name, id);
      insertGroup.run(
        id,
        companyId,
        g.name,
        null,
        g.nature,
        g.usedForCalculation ?? null,
        g.sortOrder,
      );
    }
    for (const g of DEFAULT_GROUPS.filter((x) => x.parent)) {
      const parentId = groupIds.get(g.parent!);
      if (!parentId) throw new Error(`Missing parent group: ${g.parent}`);
      const id = newId();
      groupIds.set(g.name, id);
      insertGroup.run(
        id,
        companyId,
        g.name,
        parentId,
        g.nature,
        g.usedForCalculation ?? null,
        g.sortOrder,
      );
    }

    // Essential system ledgers
    const cashGroup = groupIds.get('Cash-in-Hand')!;
    const profitGroup = groupIds.get('Profit & Loss A/c') ?? groupIds.get('Capital Account')!;
    void profitGroup;

    const insertLedger = db.prepare(`
      INSERT INTO ledger (id, company_id, name, group_id, is_system)
      VALUES (?, ?, ?, ?, 1)
    `);
    insertLedger.run(newId(), companyId, 'Cash', cashGroup);

    const insertVt = db.prepare(`
      INSERT INTO voucher_type (id, company_id, name, parent_name, is_system)
      VALUES (?, ?, ?, ?, 1)
    `);
    for (const vt of DEFAULT_VOUCHER_TYPES) {
      insertVt.run(newId(), companyId, vt.name, vt.parentName ?? null);
    }

    db.prepare(
      `INSERT INTO settings (company_id, key, value) VALUES (?, 'theme', 'dark')`,
    ).run(companyId);
    db.prepare(
      `INSERT INTO settings (company_id, key, value) VALUES (?, 'font_scale', '1')`,
    ).run(companyId);
    db.prepare(
      `INSERT INTO settings (company_id, key, value) VALUES (?, 'date_format', 'DD-MM-YYYY')`,
    ).run(companyId);
    db.prepare(
      `INSERT INTO settings (company_id, key, value) VALUES (?, 'number_format', 'indian')`,
    ).run(companyId);
  });

  run();
  return { companyId };
}
