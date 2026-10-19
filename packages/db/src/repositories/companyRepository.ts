import type { Db } from '../connection.js';
import type { CompanyFeaturesRecord, CompanyRecord, GroupRecord } from '../types.js';

export class CompanyRepository {
  constructor(private readonly db: Db) {}

  getCompany(): CompanyRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM company WHERE deleted_at IS NULL LIMIT 1`)
      .get() as CompanyRecord | undefined;
  }

  getCompanyById(id: string): CompanyRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM company WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as CompanyRecord | undefined;
  }

  getFeatures(companyId: string): CompanyFeaturesRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM company_features WHERE company_id = ?`)
      .get(companyId) as CompanyFeaturesRecord | undefined;
  }

  updateFeatures(
    companyId: string,
    patch: Partial<Omit<CompanyFeaturesRecord, 'company_id' | 'updated_at'>>,
  ): void {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${k} = @${k}`).join(', ');
    this.db
      .prepare(
        `UPDATE company_features SET ${sets}, updated_at = datetime('now') WHERE company_id = @company_id`,
      )
      .run({ ...patch, company_id: companyId });
  }

  listGroups(companyId: string): GroupRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM "group" WHERE company_id = ? AND deleted_at IS NULL ORDER BY sort_order, name`,
      )
      .all(companyId) as GroupRecord[];
  }

  countVoucherTypes(companyId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM voucher_type WHERE company_id = ? AND deleted_at IS NULL`,
      )
      .get(companyId) as { c: number };
    return row.c;
  }

  getSetting(companyId: string, key: string): string | undefined {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE company_id = ? AND key = ?`)
      .get(companyId, key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(companyId: string, key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (company_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(company_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run(companyId, key, value);
  }
}
