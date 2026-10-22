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

  /**
   * Fetch the stock movement history for an item, oldest first, ready to be
   * fed to the valuation engine.
   */
  getStockMovements(
    companyId: string,
    stockItemId: string,
    asOfDate?: string,
  ): {
    id: string;
    date: string;
    direction: 'Inward' | 'Outward';
    quantity: number;
    rate: number;
    amount: number;
    value: number;
    godownId: string | null;
    batchId: string | null;
  }[] {
    const params: unknown[] = [companyId, stockItemId];
    let dateClause = '';
    if (asOfDate) {
      dateClause = 'AND sl.date <= ?';
      params.push(asOfDate);
    }

    const rows = this.db
      .prepare(`
        SELECT sl.id, sl.date, sl.godown_id, sl.batch_id,
               sl.inward_qty, sl.outward_qty, sl.rate, sl.value
        FROM stock_ledger sl
        JOIN voucher v ON v.id = sl.voucher_id
        WHERE sl.company_id = ?
          AND sl.stock_item_id = ?
          AND v.deleted_at IS NULL
          AND v.is_cancelled = 0
          ${dateClause}
        ORDER BY sl.date ASC, v.created_at ASC
      `)
      .all(...params) as {
      id: string;
      date: string;
      inward_qty: number;
      outward_qty: number;
      rate: number;
      value: number;
      godown_id: string | null;
      batch_id: string | null;
    }[];

    return rows.map((r) => {
      const isInward = r.inward_qty > 0;
      return {
        id: r.id,
        date: r.date,
        direction: (isInward ? 'Inward' : 'Outward') as 'Inward' | 'Outward',
        quantity: isInward ? r.inward_qty : r.outward_qty,
        rate: r.rate,
        amount: r.value,
        value: r.value,
        godownId: r.godown_id,
        batchId: r.batch_id,
      };
    });
  }

  getStockItem(companyId: string, stockItemId: string): StockItemRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM stock_item WHERE id = ? AND company_id = ?`)
      .get(stockItemId, companyId) as StockItemRecord | undefined;
  }

  getBoms(companyId: string, stockItemId?: string) {
    const params: unknown[] = [companyId];
    let clause = '';
    if (stockItemId) {
      clause = 'AND stock_item_id = ?';
      params.push(stockItemId);
    }
    return this.db
      .prepare(`SELECT * FROM stock_item_bom WHERE company_id = ? ${clause} ORDER BY name`)
      .all(...params) as {
      id: string;
      company_id: string;
      stock_item_id: string;
      name: string;
      unit_id: string;
      produced_qty: number;
      components_json: string;
      by_products_json: string | null;
    }[];
  }
}
