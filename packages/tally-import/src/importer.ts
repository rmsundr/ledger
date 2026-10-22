import {
  LedgerRepository,
  newId,
  VoucherRepository,
  type Db,
  type GroupRecord,
  type VoucherTypeRecord,
  type UnitRecord,
  type StockItemRecord,
  type GodownRecord,
  type BatchRecord,
  type CostCentreRecord,
  type CostCategoryRecord,
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
  let costCategoriesImported = 0;
  let costCentresImported = 0;
  let unitsImported = 0;
  let stockGroupsImported = 0;
  let stockCategoriesImported = 0;
  let godownsImported = 0;
  let stockItemsImported = 0;
  let batchesImported = 0;
  const errors: string[] = [];

  // The date the company's books begin — used to date opening stock entries.
  const companyRow = db
    .prepare(`SELECT books_begin FROM company WHERE id = ?`)
    .get(companyId) as { books_begin: string | null } | undefined;
  const companyBooksBegin = companyRow?.books_begin ?? '1970-01-01';

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

  // 1b. Import Cost Categories
  const existingCostCategories = db
    .prepare(`SELECT * FROM cost_category WHERE company_id = ?`)
    .all(companyId) as CostCategoryRecord[];
  const costCategoryMap = new Map<string, string>();
  for (const cc of existingCostCategories) {
    costCategoryMap.set(cc.name.toLowerCase().trim(), cc.id);
  }

  for (const cc of data.costCategories) {
    const key = cc.name.toLowerCase().trim();
    if (costCategoryMap.has(key)) continue;

    const id = newId();
    db.prepare(`
      INSERT INTO cost_category (id, company_id, name, allocate_revenue, allocate_non_revenue)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, companyId, cc.name.trim(), cc.allocateRevenue ? 1 : 0, cc.allocateNonRevenue ? 1 : 0);

    costCategoryMap.set(key, id);
    costCategoriesImported++;
  }

  // 1c. Import Cost Centres
  const existingCostCentres = db
    .prepare(`SELECT * FROM cost_centre WHERE company_id = ?`)
    .all(companyId) as CostCentreRecord[];
  const costCentreMap = new Map<string, string>();
  for (const cc of existingCostCentres) {
    costCentreMap.set(cc.name.toLowerCase().trim(), cc.id);
  }

  // We need a default cost category (usually "Primary Cost Category")
  let primaryCostCategoryId = costCategoryMap.get('primary cost category');
  if (!primaryCostCategoryId) {
    // Create default
    primaryCostCategoryId = newId();
    db.prepare(`
      INSERT INTO cost_category (id, company_id, name, allocate_revenue, allocate_non_revenue)
      VALUES (?, ?, 'Primary Cost Category', 1, 0)
    `).run(primaryCostCategoryId, companyId);
    costCategoryMap.set('primary cost category', primaryCostCategoryId);
    costCategoriesImported++;
  }

  for (const cc of data.costCentres) {
    const key = cc.name.toLowerCase().trim();
    if (costCentreMap.has(key)) continue;

    let categoryId = costCategoryMap.get(cc.categoryName.toLowerCase().trim()) ?? primaryCostCategoryId;
    let parentId: string | null = null;
    if (cc.parentName) {
      parentId = costCentreMap.get(cc.parentName.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO cost_centre (id, company_id, category_id, parent_id, name)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, companyId, categoryId, parentId, cc.name.trim());

    costCentreMap.set(key, id);
    costCentresImported++;
  }

  // 1d. Import Units
  const existingUnits = db
    .prepare(`SELECT * FROM unit WHERE company_id = ?`)
    .all(companyId) as UnitRecord[];
  const unitMap = new Map<string, string>();
  for (const u of existingUnits) {
    unitMap.set(u.symbol.toLowerCase().trim(), u.id);
  }

  for (const u of data.units) {
    const key = u.symbol.toLowerCase().trim();
    if (unitMap.has(key)) continue;

    let baseUnitId: string | null = null;
    if (u.baseUnitSymbol) {
      baseUnitId = unitMap.get(u.baseUnitSymbol.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO unit (id, company_id, symbol, formal_name, decimal_places, is_compound, base_unit_id, conversion_factor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, companyId, u.symbol.trim(), u.formalName.trim(), u.decimalPlaces, u.isCompound ? 1 : 0, baseUnitId, u.conversionFactor ?? null);

    unitMap.set(key, id);
    unitsImported++;
  }

  // 1e. Import Stock Groups
  const existingStockGroups = db
    .prepare(`SELECT * FROM stock_group WHERE company_id = ?`)
    .all(companyId);
  const stockGroupMap = new Map<string, string>();
  for (const sg of existingStockGroups as { id: string; name: string }[]) {
    stockGroupMap.set(sg.name.toLowerCase().trim(), sg.id);
  }

  for (const sg of data.stockGroups) {
    const key = sg.name.toLowerCase().trim();
    if (stockGroupMap.has(key)) continue;

    let parentId: string | null = null;
    if (sg.parentName) {
      parentId = stockGroupMap.get(sg.parentName.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO stock_group (id, company_id, name, parent_id)
      VALUES (?, ?, ?, ?)
    `).run(id, companyId, sg.name.trim(), parentId);

    stockGroupMap.set(key, id);
    stockGroupsImported++;
  }

  // 1f. Import Stock Categories
  const existingStockCategories = db
    .prepare(`SELECT * FROM stock_category WHERE company_id = ?`)
    .all(companyId);
  const stockCategoryMap = new Map<string, string>();
  for (const sc of existingStockCategories as { id: string; name: string }[]) {
    stockCategoryMap.set(sc.name.toLowerCase().trim(), sc.id);
  }

  for (const sc of data.stockCategories) {
    const key = sc.name.toLowerCase().trim();
    if (stockCategoryMap.has(key)) continue;

    let parentId: string | null = null;
    if (sc.parentName) {
      parentId = stockCategoryMap.get(sc.parentName.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO stock_category (id, company_id, name, parent_id)
      VALUES (?, ?, ?, ?)
    `).run(id, companyId, sc.name.trim(), parentId);

    stockCategoryMap.set(key, id);
    stockCategoriesImported++;
  }

  // 1g. Import Godowns
  const existingGodowns = db
    .prepare(`SELECT * FROM godown WHERE company_id = ?`)
    .all(companyId) as GodownRecord[];
  const godownMap = new Map<string, string>();
  for (const g of existingGodowns) {
    godownMap.set(g.name.toLowerCase().trim(), g.id);
  }

  for (const g of data.godowns) {
    const key = g.name.toLowerCase().trim();
    if (godownMap.has(key)) continue;

    let parentId: string | null = null;
    if (g.parentName) {
      parentId = godownMap.get(g.parentName.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    db.prepare(`
      INSERT INTO godown (id, company_id, name, parent_id)
      VALUES (?, ?, ?, ?)
    `).run(id, companyId, g.name.trim(), parentId);

    godownMap.set(key, id);
    godownsImported++;
  }

  // 1h. Import Stock Items
  const existingStockItems = db
    .prepare(`SELECT * FROM stock_item WHERE company_id = ? AND deleted_at IS NULL`)
    .all(companyId) as StockItemRecord[];
  const stockItemMap = new Map<string, string>();
  for (const si of existingStockItems) {
    stockItemMap.set(si.name.toLowerCase().trim(), si.id);
  }

  // Ensure a default unit exists
  let defaultUnitId = unitMap.get('pcs') || unitMap.get('pc') || unitMap.get('nos') || unitMap.get('no') || unitMap.get('pieces');
  if (!defaultUnitId && unitMap.size > 0) {
    defaultUnitId = Array.from(unitMap.values())[0];
  }
  if (!defaultUnitId) {
    // Create default PCS unit
    defaultUnitId = newId();
    db.prepare(`
      INSERT INTO unit (id, company_id, symbol, formal_name, decimal_places, is_compound)
      VALUES (?, ?, 'PCS', 'Pieces', 0, 0)
    `).run(defaultUnitId, companyId);
    unitMap.set('pcs', defaultUnitId);
    unitsImported++;
  }

  for (const si of data.stockItems) {
    const key = si.name.toLowerCase().trim();
    if (stockItemMap.has(key)) continue;

    const unitId = unitMap.get(si.unitSymbol.toLowerCase().trim()) ?? defaultUnitId;
    let alternateUnitId: string | null = null;
    if (si.alternateUnitSymbol) {
      alternateUnitId = unitMap.get(si.alternateUnitSymbol.toLowerCase().trim()) ?? null;
    }
    let groupId: string | null = null;
    if (si.groupName) {
      groupId = stockGroupMap.get(si.groupName.toLowerCase().trim()) ?? null;
    }
    let categoryId: string | null = null;
    if (si.categoryName) {
      categoryId = stockCategoryMap.get(si.categoryName.toLowerCase().trim()) ?? null;
    }
    let godownId: string | null = null;
    if (si.openingGodownName) {
      godownId = godownMap.get(si.openingGodownName.toLowerCase().trim()) ?? null;
    }

    const id = newId();
    const openingRateMinor = Math.round(si.openingRate ?? 0);
    const openingValueMinor = Math.round(si.openingValue ?? 0);

    db.prepare(`
      INSERT INTO stock_item (
        id, company_id, name, alias, part_no, group_id, category_id, unit_id,
        alternate_unit_id, alt_conversion_numerator, alt_conversion_denominator,
        costing_method, market_valuation_method, opening_quantity, opening_rate,
        opening_value, opening_godown_id, maintain_batches, track_manufacturing_date,
        track_expiry_date, reorder_level, min_order_qty, hsn_sac, gst_taxability,
        gst_rate, cess_rate, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, companyId, si.name.trim(), si.alias?.trim() ?? '', si.partNo?.trim() ?? '',
      groupId, categoryId, unitId, alternateUnitId,
      si.altConversionNumerator ?? null, si.altConversionDenominator ?? null,
      si.costingMethod ?? 'Avg Cost', 'Avg Price',
      si.openingQuantity ?? 0, openingRateMinor, openingValueMinor,
      godownId,
      si.maintainBatches ? 1 : 0,
      si.trackManufacturingDate ? 1 : 0,
      si.trackExpiryDate ? 1 : 0,
      si.reorderLevel ?? null,
      si.minOrderQty ?? null,
      si.hsnSac?.trim() ?? '',
      si.gstTaxability ?? 'Taxable',
      si.gstRate ?? 0,
      si.cessRate ?? 0,
      si.description?.trim() ?? ''
    );

    stockItemMap.set(key, id);
    stockItemsImported++;

    // Record the item's opening stock so the opening quantity, rate and value
    // survive the import instead of sitting only on the item master.
    const itemOpeningQty = si.openingQuantity ?? 0;
    if (itemOpeningQty > 0) {
      db.prepare(`
        INSERT INTO stock_ledger (
          id, company_id, voucher_id, date, stock_item_id, godown_id, batch_id,
          inward_qty, outward_qty, rate, value
        ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, 0, ?, ?)
      `).run(
        newId(),
        companyId,
        companyBooksBegin,
        id,
        godownId,
        itemOpeningQty,
        openingRateMinor,
        openingValueMinor,
      );
    }
  }

  // 1i. Import Batches
  const existingBatches = db
    .prepare(`SELECT * FROM batch WHERE company_id = ?`)
    .all(companyId) as BatchRecord[];
  const batchMap = new Map<string, string>(); // key: "stockItemId|batchName"
  for (const b of existingBatches) {
    batchMap.set(`${b.stock_item_id}|${b.name.toLowerCase().trim()}`, b.id);
  }

  for (const b of data.batches) {
    const stockItemId = stockItemMap.get(b.stockItemName.toLowerCase().trim());
    if (!stockItemId) continue; // stock item must exist first

    const batchKey = `${stockItemId}|${b.name.toLowerCase().trim()}`;
    if (batchMap.has(batchKey)) continue;

    const id = newId();
    const mfgDate = b.manufacturingDate ? (() => {
      const clean = b.manufacturingDate!.trim();
      if (/^\d{8}$/.test(clean)) return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
      return clean;
    })() : null;
    const expDate = b.expiryDate ? (() => {
      const clean = b.expiryDate!.trim();
      if (/^\d{8}$/.test(clean)) return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
      return clean;
    })() : null;
    const openingRateMinor = Math.round(b.openingRate ?? 0);
    const openingValueMinor = Math.round(b.openingValue ?? 0);

    db.prepare(`
      INSERT INTO batch (id, company_id, stock_item_id, name, manufacturing_date, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, companyId, stockItemId, b.name.trim(), mfgDate, expDate);

    batchMap.set(batchKey, id);
    batchesImported++;

    // Record the batch's opening stock so the quantity, rate and value are
    // not silently dropped. The batch table itself carries no opening
    // columns, so the opening position lives in the stock ledger.
    const openingQty = b.openingQuantity ?? 0;
    if (openingQty > 0) {
      let batchGodownId: string | null = null;
      if (b.godownName) {
        batchGodownId = godownMap.get(b.godownName.toLowerCase().trim()) ?? null;
      }
      db.prepare(`
        INSERT INTO stock_ledger (
          id, company_id, voucher_id, date, stock_item_id, godown_id, batch_id,
          inward_qty, outward_qty, rate, value
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        newId(),
        companyId,
        companyBooksBegin,
        stockItemId,
        batchGodownId,
        id,
        openingQty,
        openingRateMinor,
        openingValueMinor,
      );
    }
  }

  // 2. Import Ledgers
  const ledgerMap = new Map<string, string>();
  const existingLedgers = ledgerRepo.list(companyId);
  for (const l of existingLedgers) {
    ledgerMap.set(l.name.toLowerCase().trim(), l.id);
    ledgerMap.set(l.name.trim(), l.id);
  }

  const suspenseGroupId = groupMap.get('suspense a/c') || Array.from(groupMap.values())[0];

  for (const l of data.ledgers) {
    const normalizedName = l.name.trim().toLowerCase();
    const originalName = l.name.trim();
    let ledgerId = ledgerMap.get(normalizedName) || ledgerMap.get(originalName);

    if (!ledgerId) {
      const parentId = groupMap.get(l.parentGroup.toLowerCase().trim()) ?? suspenseGroupId;
      const created = ledgerRepo.create({
        companyId,
        name: originalName,
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
      ledgerMap.set(normalizedName, ledgerId);
      ledgerMap.set(originalName, ledgerId);
      ledgersImported++;
    } else {
      ledgerMap.set(normalizedName, ledgerId);
      ledgerMap.set(originalName, ledgerId);
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

  // Voucher numbers restart every financial year in Tally, so the same
  // number ("INV-001") recurs in each year and would collide with
  // UNIQUE (company_id, voucher_type_id, voucher_number). Track the numbers
  // already used per voucher type and disambiguate collisions with a
  // financial-year suffix, keeping the original number in reference_no.
  const usedVoucherNumbers = new Set<string>();
  const existingNumbers = db
    .prepare(`SELECT voucher_type_id, voucher_number FROM voucher WHERE company_id = ?`)
    .all(companyId) as { voucher_type_id: string; voucher_number: string }[];
  for (const row of existingNumbers) {
    usedVoucherNumbers.add(`${row.voucher_type_id} ${row.voucher_number}`);
  }

  const financialYearOf = (date: string): string => {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    // Indian financial year runs April to March.
    return month >= 4 ? `${year}-${String((year + 1) % 100).padStart(2, '0')}` : `${year - 1}-${String(year % 100).padStart(2, '0')}`;
  };

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

      const vt = resolveVoucherType(db, companyId, vtMap, v.voucherType) ?? defaultVt;

      // Map entries
      const mappedEntries = v.entries
        .map((e) => {
          const lId = ledgerMap.get(e.ledgerName.toLowerCase().trim());
          if (!lId) {
            // Auto-create missing ledger under Suspense A/c
            const newL = ledgerRepo.create({
              companyId,
              name: e.ledgerName.trim(),
              groupId: suspenseGroupId,
            });
            ledgerMap.set(e.ledgerName.toLowerCase().trim(), newL.id);
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
        });
      // Zero-valued entries are kept: Tally allows nil vouchers, and
      // dropping entries here would shift the entry indices that the bill
      // and inventory allocations below refer to.

      if (mappedEntries.length === 0) {
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

      // Prepare bill allocations, cost allocations, inventory entries for voucherRepo.createVoucher
      const billAllocations: {
        entryIndex: number;
        partyLedgerId: string;
        refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
        refName: string;
        amount: number;
        isDebit: boolean;
        dueDate?: string;
      }[] = [];

      const costAllocations: {
        entryIndex: number;
        costCentreId: string;
        amount: number;
      }[] = [];

      const inventoryEntries: {
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
      }[] = [];

      // Iterate entries with index to map back to voucher entries
      for (let entryIndex = 0; entryIndex < v.entries.length; entryIndex++) {
        const e = v.entries[entryIndex];
        const lId = ledgerMap.get(e.ledgerName.toLowerCase().trim());
        if (!lId) continue; // should have been created above

        // Bill allocations
        if (e.billAllocations && e.billAllocations.length > 0) {
          for (const ba of e.billAllocations) {
            billAllocations.push({
              entryIndex,
              partyLedgerId: lId,
              refType: ba.refType,
              refName: ba.refName,
              amount: ba.amount,
              isDebit: ba.isDebit,
              dueDate: ba.dueDate,
            });
          }
        }

        // Cost allocations
        if (e.costAllocations && e.costAllocations.length > 0) {
          for (const ca of e.costAllocations) {
            const costCentreId = costCentreMap.get(ca.costCentreName.toLowerCase().trim());
            if (costCentreId) {
              costAllocations.push({
                entryIndex,
                costCentreId,
                amount: ca.amount,
              });
            }
          }
        }

        // Inventory entries
        if (e.inventoryEntries && e.inventoryEntries.length > 0) {
          for (const ie of e.inventoryEntries) {
            // A DayBook export references stock items, godowns and batches
            // by name but carries no masters for them (those live in the
            // separate Master export). Create them on demand so the
            // inventory quantities are not silently dropped.
            const stockItemId = ensureStockItem(db, companyId, stockItemMap, ie.stockItemName, defaultUnitId);

            let godownId: string | null = null;
            if (ie.godownName) {
              godownId = ensureGodown(db, companyId, godownMap, ie.godownName);
            }
            let batchId: string | null = null;
            if (ie.batchName) {
              batchId = ensureBatch(db, companyId, batchMap, stockItemId, ie.batchName);
            }

            inventoryEntries.push({
              stockItemId,
              godownId: godownId ?? undefined,
              batchId: batchId ?? undefined,
              entryType: ie.entryType,
              quantity: ie.quantity,
              rate: Math.round(ie.rate ?? 0),
              amount: Math.round(ie.amount ?? 0),
              trackingNumber: ie.trackingNumber,
              orderNumber: ie.orderNumber,
            });
          }
        }
      }

      const resolvedNumber = resolveVoucherNumber(
        usedVoucherNumbers,
        vt.id,
        v.voucherNumber,
        financialYearOf(v.date),
      );

      const createdVoucher = voucherRepo.createVoucher({
        companyId,
        voucherTypeId: vt.id,
        voucherTypeName: vt.name,
        voucherNumber: resolvedNumber.number,
        date: v.date,
        // Keep Tally's own reference; when the number had to be suffixed to
        // avoid a year-on-year collision, keep the original number too.
        referenceNo: resolvedNumber.disambiguated
          ? [v.referenceNo, v.voucherNumber].filter(Boolean).join(' / ')
          : (v.referenceNo ?? ''),
        narration: v.narration,
        guid: v.guid,
        ledgerEntries: mappedEntries,
        billAllocations: billAllocations.length > 0 ? billAllocations : undefined,
        costAllocations: costAllocations.length > 0 ? costAllocations : undefined,
        inventoryEntries: inventoryEntries.length > 0 ? inventoryEntries : undefined,
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
    costCategoriesImported,
    costCentresImported,
    unitsImported,
    stockGroupsImported,
    stockCategoriesImported,
    godownsImported,
    stockItemsImported,
    batchesImported,
    errors,
    reconciliation: {
      totalClosingDebit: tb.totalClosingDebit,
      totalClosingCredit: tb.totalClosingCredit,
      difference: tb.difference,
      isBalanced: tb.isBalanced,
    },
  };
}

/**
 * Resolve a Tally voucher type against the company's voucher types.
 *
 * Real Tally companies use types LedgerDesk does not ship with — "Sales GST"
 * and "Purchase GST" are the two most common, appearing in the vast majority
 * of TallyPrime exports. Create them on demand so those vouchers import as
 * their own type instead of being lumped into Journal.
 */
function resolveVoucherType(
  db: Db,
  companyId: string,
  vtMap: Map<string, VoucherTypeRecord>,
  tallyType: string,
): VoucherTypeRecord | undefined {
  const key = tallyType.trim().toLowerCase();
  if (!key) return undefined;

  const existing = vtMap.get(key);
  if (existing) return existing;

  const id = newId();
  db.prepare(`
    INSERT INTO voucher_type (id, company_id, name, parent_name, is_system)
    VALUES (?, ?, ?, NULL, 0)
  `).run(id, companyId, tallyType.trim());

  const created = {
    id,
    company_id: companyId,
    name: tallyType.trim(),
    parent_name: null,
    numbering_method: 'Manual',
    prefix: '',
    suffix: '',
    restart_numbering: 'Yearly',
    prevent_duplicates: 1,
    use_effective_dates: 0,
    allow_zero_valued: 0,
    optional_by_default: 0,
    narration_per_ledger: 0,
    print_after_save: 0,
    is_system: 0,
    deleted_at: null,
  } as unknown as VoucherTypeRecord;

  vtMap.set(key, created);
  return created;
}

/**
 * Create a stock item on demand.
 *
 * A DayBook export names the items it moves but carries no item masters, so
 * every referenced item has to be created or its quantities are lost.
 */
function ensureStockItem(
  db: Db,
  companyId: string,
  stockItemMap: Map<string, string>,
  name: string,
  unitId: string,
): string {
  const clean = name.trim();
  const key = clean.toLowerCase();
  const existing = stockItemMap.get(key);
  if (existing) return existing;

  const id = newId();
  db.prepare(`
    INSERT INTO stock_item (
      id, company_id, name, alias, part_no, group_id, category_id, unit_id,
      alternate_unit_id, alt_conversion_numerator, alt_conversion_denominator,
      costing_method, market_valuation_method, opening_quantity, opening_rate,
      opening_value, opening_godown_id, maintain_batches, track_manufacturing_date,
      track_expiry_date, reorder_level, min_order_qty, hsn_sac, gst_taxability,
      gst_rate, cess_rate, description
    ) VALUES (?, ?, ?, '', '', NULL, NULL, ?, NULL, NULL, NULL, 'Avg Cost', 'Avg Price', 0, 0, 0, NULL, 0, 0, 0, NULL, NULL, '', 'Taxable', 0, 0, '')
  `).run(id, companyId, clean, unitId);

  stockItemMap.set(key, id);
  return id;
}

/** Create a godown on demand. */
function ensureGodown(
  db: Db,
  companyId: string,
  godownMap: Map<string, string>,
  name: string,
): string {
  const clean = name.trim();
  const key = clean.toLowerCase();
  const existing = godownMap.get(key);
  if (existing) return existing;

  const id = newId();
  db.prepare(`
    INSERT INTO godown (id, company_id, name, parent_id) VALUES (?, ?, ?, NULL)
  `).run(id, companyId, clean);

  godownMap.set(key, id);
  return id;
}

/** Create a batch on demand. */
function ensureBatch(
  db: Db,
  companyId: string,
  batchMap: Map<string, string>,
  stockItemId: string,
  name: string,
): string {
  const clean = name.trim();
  const key = `${stockItemId}|${clean.toLowerCase()}`;
  const existing = batchMap.get(key);
  if (existing) return existing;

  const id = newId();
  db.prepare(`
    INSERT INTO batch (id, company_id, stock_item_id, name, manufacturing_date, expiry_date)
    VALUES (?, ?, ?, ?, NULL, NULL)
  `).run(id, companyId, stockItemId, clean);

  batchMap.set(key, id);
  return id;
}

/**
 * Produce a voucher number that is unique within its voucher type.
 *
 * Tally restarts voucher numbering every financial year, so "INV-001" exists
 * once per year. LedgerDesk's schema allows only one voucher per
 * (company, type, number), so a collision is resolved by appending the
 * financial year — "INV-001/23-24" — and, if that also collides, a counter.
 */
function resolveVoucherNumber(
  used: Set<string>,
  voucherTypeId: string,
  original: string,
  financialYear: string,
): { number: string; disambiguated: boolean } {
  const base = original.trim() || '1';
  const key = (n: string) => `${voucherTypeId} ${n}`;

  if (!used.has(key(base))) {
    used.add(key(base));
    return { number: base, disambiguated: false };
  }

  const withYear = `${base}/${financialYear}`;
  if (!used.has(key(withYear))) {
    used.add(key(withYear));
    return { number: withYear, disambiguated: true };
  }

  let counter = 2;
  while (used.has(key(`${withYear}-${counter}`))) {
    counter++;
  }
  const unique = `${withYear}-${counter}`;
  used.add(key(unique));
  return { number: unique, disambiguated: true };
}