import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type {
  GodownRecord,
  StockGroupRecord,
  StockItemRecord,
  UnitRecord,
} from '../types.js';

export class InventoryRepository {
  constructor(private readonly db: Db) {}

  // Units
  listUnits(companyId: string): UnitRecord[] {
    return this.db.prepare(`SELECT * FROM unit WHERE company_id = ? ORDER BY symbol`).all(companyId) as UnitRecord[];
  }

  createUnit(input: {
    companyId: string;
    symbol: string;
    formalName: string;
    decimalPlaces?: number;
    isCompound?: boolean;
    baseUnitId?: string;
    conversionFactor?: number;
  }): UnitRecord {
    const id = newId();
    this.db.prepare(`
      INSERT INTO unit (id, company_id, symbol, formal_name, decimal_places, is_compound, base_unit_id, conversion_factor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.companyId,
      input.symbol.trim(),
      input.formalName.trim(),
      input.decimalPlaces ?? 0,
      input.isCompound ? 1 : 0,
      input.baseUnitId ?? null,
      input.conversionFactor ?? null,
    );
    return this.db.prepare(`SELECT * FROM unit WHERE id = ?`).get(id) as UnitRecord;
  }

  // Stock Groups
  listStockGroups(companyId: string): StockGroupRecord[] {
    return this.db.prepare(`SELECT * FROM stock_group WHERE company_id = ? ORDER BY name`).all(companyId) as StockGroupRecord[];
  }

  createStockGroup(input: { companyId: string; name: string; parentId?: string }): StockGroupRecord {
    const id = newId();
    this.db.prepare(`INSERT INTO stock_group (id, company_id, name, parent_id) VALUES (?, ?, ?, ?)`).run(
      id,
      input.companyId,
      input.name.trim(),
      input.parentId ?? null,
    );
    return this.db.prepare(`SELECT * FROM stock_group WHERE id = ?`).get(id) as StockGroupRecord;
  }

  // Godowns
  listGodowns(companyId: string): GodownRecord[] {
    return this.db.prepare(`SELECT * FROM godown WHERE company_id = ? ORDER BY name`).all(companyId) as GodownRecord[];
  }

  createGodown(input: { companyId: string; name: string; address?: string; parentId?: string }): GodownRecord {
    const id = newId();
    this.db.prepare(`INSERT INTO godown (id, company_id, name, parent_id, address) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      input.companyId,
      input.name.trim(),
      input.parentId ?? null,
      input.address ?? '',
    );
    return this.db.prepare(`SELECT * FROM godown WHERE id = ?`).get(id) as GodownRecord;
  }

  // Stock Items
  listStockItems(companyId: string): (StockItemRecord & {
    unit_symbol: string;
    group_name: string;
    current_qty: number;
    closing_value: number;
  })[] {
    const sql = `
      SELECT
        si.*,
        u.symbol AS unit_symbol,
        COALESCE(sg.name, 'Primary') AS group_name,
        COALESCE(si.opening_quantity, 0) + COALESCE(SUM(sl.inward_qty), 0) - COALESCE(SUM(sl.outward_qty), 0) AS current_qty,
        COALESCE(si.opening_value, 0) + COALESCE(SUM(sl.inward_qty * sl.rate), 0) - COALESCE(SUM(sl.outward_qty * sl.rate), 0) AS closing_value
      FROM stock_item si
      JOIN unit u ON si.unit_id = u.id
      LEFT JOIN stock_group sg ON si.group_id = sg.id
      LEFT JOIN stock_ledger sl ON sl.stock_item_id = si.id
      WHERE si.company_id = ? AND si.deleted_at IS NULL
      GROUP BY si.id
      ORDER BY si.name
    `;
    return this.db.prepare(sql).all(companyId) as (StockItemRecord & {
      unit_symbol: string;
      group_name: string;
      current_qty: number;
      closing_value: number;
    })[];
  }

  createStockItem(input: {
    companyId: string;
    name: string;
    alias?: string;
    partNo?: string;
    groupId?: string;
    unitId: string;
    costingMethod?: 'Avg Cost' | 'FIFO' | 'LIFO' | 'Last Purchase Cost' | 'Std Cost' | 'Zero Cost';
    openingQuantity?: number;
    openingRate?: number;
    openingValue?: number;
    openingGodownId?: string;
    hsnSac?: string;
    gstRate?: number;
  }): StockItemRecord {
    const id = newId();
    const openingQty = input.openingQuantity ?? 0;
    const openingRate = input.openingRate ?? 0;
    const openingVal = input.openingValue ?? Math.round(openingQty * openingRate);

    this.db.prepare(`
      INSERT INTO stock_item (
        id, company_id, name, alias, part_no, group_id, unit_id,
        costing_method, opening_quantity, opening_rate, opening_value,
        opening_godown_id, hsn_sac, gst_rate
      ) VALUES (
        @id, @companyId, @name, @alias, @partNo, @groupId, @unitId,
        @costingMethod, @openingQuantity, @openingRate, @openingValue,
        @openingGodownId, @hsnSac, @gstRate
      )
    `).run({
      id,
      companyId: input.companyId,
      name: input.name.trim(),
      alias: input.alias?.trim() ?? '',
      partNo: input.partNo?.trim() ?? '',
      groupId: input.groupId ?? null,
      unitId: input.unitId,
      costingMethod: input.costingMethod ?? 'Avg Cost',
      openingQuantity: openingQty,
      openingRate: openingRate,
      openingValue: openingVal,
      openingGodownId: input.openingGodownId ?? null,
      hsnSac: input.hsnSac ?? '',
      gstRate: input.gstRate ?? 0,
    });

    return this.db.prepare(`SELECT * FROM stock_item WHERE id = ?`).get(id) as StockItemRecord;
  }
}
