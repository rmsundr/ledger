import {
  LedgerRepository,
  newId,
  VoucherRepository,
  type Db,
  type GroupRecord,
  type VoucherTypeRecord,
} from '@ledgerdesk/db';
import { generateTrialBalance } from '@ledgerdesk/reports';
import type { TallyImportData, TallyImportResult } from './types.js';

export function importTallyData(db: Db, companyId: string, data: TallyImportData): TallyImportResult {
  const ledgerRepo = new LedgerRepository(db);
  const voucherRepo = new VoucherRepository(db);

  let groupsImported = 0;
  let ledgersImported = 0;
  let vouchersImported = 0;
  let vouchersSkipped = 0;
  const errors: string[] = [];

  const existingGroups = db
    .prepare(`SELECT * FROM "group" WHERE company_id = ? AND deleted_at IS NULL`)
    .all(companyId) as GroupRecord[];

  const groupMap = new Map<string, string>();
  for (const g of existingGroups) {
    groupMap.set(g.name.toLowerCase(), g.id);
  }

  // 1. Import Groups
  for (const g of data.groups) {
    const key = g.name.toLowerCase();
    if (groupMap.has(key)) continue;

    let parentId: string | null = null;
    if (g.parentName) {
      parentId = groupMap.get(g.parentName.toLowerCase()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO "group" (id, company_id, name, parent_id, nature)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, companyId, g.name.trim(), parentId, g.nature ?? 'Liabilities');

    groupMap.set(key, id);
    groupsImported++;
  }

  // 2. Import Ledgers
  const ledgerMap = new Map<string, string>();
  const existingLedgers = ledgerRepo.list(companyId);
  for (const l of existingLedgers) {
    ledgerMap.set(l.name.toLowerCase(), l.id);
  }

  const suspenseGroupId = groupMap.get('suspense a/c') || Array.from(groupMap.values())[0];

  for (const l of data.ledgers) {
    const key = l.name.toLowerCase();
    let ledgerId = ledgerMap.get(key);

    if (!ledgerId) {
      const parentId = groupMap.get(l.parentGroup.toLowerCase()) ?? suspenseGroupId;
      const created = ledgerRepo.create({
        companyId,
        name: l.name.trim(),
        groupId: parentId,
        openingBalance: l.openingBalance,
        openingIsDebit: l.openingIsDebit,
        state: l.state,
        country: l.country,
        pin: l.pin,
        pan: l.pan,
        gstin: l.gstin,
        gstRegistrationType: l.gstRegistrationType,
        maintainBillByBill: l.maintainBillByBill,
      });
      ledgerId = created.id;
      ledgerMap.set(key, ledgerId);
      ledgersImported++;
    }
  }

  // 3. Import Vouchers
  const voucherTypes = db
    .prepare(`SELECT * FROM voucher_type WHERE company_id = ? AND deleted_at IS NULL`)
    .all(companyId) as VoucherTypeRecord[];

  const vtMap = new Map<string, VoucherTypeRecord>();
  for (const vt of voucherTypes) {
    vtMap.set(vt.name.toLowerCase(), vt);
  }

  const defaultVt = vtMap.get('journal') || voucherTypes[0];

  for (const v of data.vouchers) {
    try {
      // Check idempotency if GUID exists
      if (v.guid) {
        const existing = db
          .prepare(`SELECT 1 FROM tally_import_map WHERE company_id = ? AND tally_guid = ?`)
          .get(companyId, v.guid);
        if (existing) {
          vouchersSkipped++;
          continue;
        }
      }

      const vt = vtMap.get(v.voucherType.toLowerCase()) ?? defaultVt;

      // Map entries
      const mappedEntries = v.entries
        .map((e) => {
          const lId = ledgerMap.get(e.ledgerName.toLowerCase());
          if (!lId) {
            // Auto-create missing ledger under Suspense A/c
            const newL = ledgerRepo.create({
              companyId,
              name: e.ledgerName,
              groupId: suspenseGroupId,
            });
            ledgerMap.set(e.ledgerName.toLowerCase(), newL.id);
            return {
              ledgerId: newL.id,
              isDebit: e.isDebit,
              amount: e.amount,
              narration: e.narration,
            };
          }
          return {
            ledgerId: lId,
            isDebit: e.isDebit,
            amount: e.amount,
            narration: e.narration,
          };
        })
        .filter((e) => e.amount > 0);

      if (mappedEntries.length < 2) {
        vouchersSkipped++;
        continue;
      }

      // Check balance
      let totalDr = 0;
      let totalCr = 0;
      for (const me of mappedEntries) {
        if (me.isDebit) totalDr += me.amount;
        else totalCr += me.amount;
      }

      if (totalDr !== totalCr) {
        errors.push(`Voucher #${v.voucherNumber} (${v.voucherType}) out of balance: Dr ${totalDr} != Cr ${totalCr}`);
        vouchersSkipped++;
        continue;
      }

      const createdVoucher = voucherRepo.createVoucher({
        companyId,
        voucherTypeId: vt.id,
        voucherTypeName: vt.name,
        voucherNumber: v.voucherNumber,
        date: v.date,
        referenceNo: v.referenceNo,
        narration: v.narration,
        guid: v.guid,
        ledgerEntries: mappedEntries,
      });

      if (v.guid) {
        db.prepare(`
          INSERT INTO tally_import_map (id, company_id, entity_type, tally_guid, local_id)
          VALUES (?, ?, 'VOUCHER', ?, ?)
        `).run(newId(), companyId, v.guid, createdVoucher.id);
      }

      vouchersImported++;
    } catch (err) {
      errors.push(`Failed importing voucher #${v.voucherNumber}: ${err instanceof Error ? err.message : String(err)}`);
      vouchersSkipped++;
    }
  }

  // 4. Generate Reconciliation Report
  const tb = generateTrialBalance(db, companyId);

  return {
    groupsImported,
    ledgersImported,
    vouchersImported,
    vouchersSkipped,
    errors,
    reconciliation: {
      totalClosingDebit: tb.totalClosingDebit,
      totalClosingCredit: tb.totalClosingCredit,
      difference: tb.difference,
      isBalanced: tb.isBalanced,
    },
  };
}
