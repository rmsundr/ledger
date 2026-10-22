import crypto from 'node:crypto';
import type { Db } from '@ledgerdesk/db';
import { newId } from '@ledgerdesk/db';

export class AuditService {
  constructor(private readonly db: Db, private readonly companyId: string) {}

  logAction(userId: string | undefined, action: string, entityType: string, entityId: string | undefined, detailsObj: unknown): void {
    const detailsJson = JSON.stringify(detailsObj ?? {});

    // Get last audit log entry for hash chaining.
    //
    // `rowid` is used rather than `created_at` because two entries logged in the
    // same millisecond share a timestamp — ordering by it would make the chain
    // ambiguous and verification would fail on a legitimate log.
    const last = this.db.prepare(`
      SELECT entry_hash FROM audit_log WHERE company_id = ? ORDER BY rowid DESC LIMIT 1
    `).get(this.companyId) as { entry_hash: string } | undefined;

    const prevHash = last?.entry_hash ?? '0';
    const id = newId();
    const createdAt = new Date().toISOString();

    const payload = `${prevHash}|${userId ?? ''}|${action}|${entityType}|${entityId ?? ''}|${detailsJson}|${createdAt}`;
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex');

    this.db.prepare(`
      INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, details_json, prev_hash, entry_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.companyId, userId ?? null, action, entityType, entityId ?? null, detailsJson, prevHash, entryHash, createdAt);
  }

  logEdit(userId: string | undefined, entityType: string, entityId: string, beforeObj: unknown, afterObj: unknown): void {
    const id = newId();
    const beforeJson = JSON.stringify(beforeObj ?? null);
    const afterJson = JSON.stringify(afterObj ?? null);

    this.db.prepare(`
      INSERT INTO edit_log (id, company_id, user_id, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.companyId, userId ?? null, entityType, entityId, beforeJson, afterJson);
  }

  verifyChain(): { isValid: boolean; brokenAtId?: string } {
    const rows = this.db.prepare(`
      SELECT id, user_id, action, entity_type, entity_id, details_json, prev_hash, entry_hash, created_at
      FROM audit_log WHERE company_id = ? ORDER BY rowid ASC
    `).all(this.companyId) as any[];

    let expectedPrev = '0';
    for (const r of rows) {
      if (r.prev_hash !== expectedPrev) {
        return { isValid: false, brokenAtId: r.id };
      }
      const payload = `${r.prev_hash}|${r.user_id ?? ''}|${r.action}|${r.entity_type}|${r.entity_id ?? ''}|${r.details_json}|${r.created_at}`;
      const computedHash = crypto.createHash('sha256').update(payload).digest('hex');
      if (computedHash !== r.entry_hash) {
        return { isValid: false, brokenAtId: r.id };
      }
      expectedPrev = r.entry_hash;
    }

    return { isValid: true };
  }
}
