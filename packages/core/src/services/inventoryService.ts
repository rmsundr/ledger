import {
  InventoryRepository,
  type Db,
  type GodownRecord,
  type StockGroupRecord,
  type StockItemRecord,
  type UnitRecord,
} from '@ledgerdesk/db';
import { z } from 'zod';
import {
  explodeBom,
  valueStockMovements,
  type BomComponent,
  type CostingMethod,
  type ValuationResult as StockValuation,
} from './stockValuation.js';

export const createUnitSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  formalName: z.string().min(1, 'Formal name is required'),
  decimalPlaces: z.number().int().min(0).max(4).optional().default(0),
  isCompound: z.boolean().optional(),
  baseUnitId: z.string().optional(),
  conversionFactor: z.number().positive().optional(),
});

export const createStockItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  alias: z.string().optional(),
  partNo: z.string().optional(),
  groupId: z.string().optional(),
  unitId: z.string().min(1, 'Base unit is required'),
  costingMethod: z.enum(['Avg Cost', 'FIFO', 'LIFO', 'Last Purchase Cost', 'Std Cost', 'Zero Cost']).optional().default('Avg Cost'),
  openingQuantity: z.number().nonnegative().optional().default(0),
  openingRate: z.number().int().nonnegative().optional().default(0),
  openingValue: z.number().int().nonnegative().optional().default(0),
  openingGodownId: z.string().optional(),
  hsnSac: z.string().optional(),
  gstRate: z.number().nonnegative().optional().default(0),
});

export class InventoryService {
  private repo: InventoryRepository;

  constructor(db: Db) {
    this.repo = new InventoryRepository(db);
  }

  listUnits(companyId: string): UnitRecord[] {
    return this.repo.listUnits(companyId);
  }

  createUnit(companyId: string, raw: z.infer<typeof createUnitSchema>): UnitRecord {
    const input = createUnitSchema.parse(raw);
    return this.repo.createUnit({ ...input, companyId });
  }

  listStockGroups(companyId: string): StockGroupRecord[] {
    return this.repo.listStockGroups(companyId);
  }

  createStockGroup(companyId: string, name: string, parentId?: string): StockGroupRecord {
    return this.repo.createStockGroup({ companyId, name, parentId });
  }

  listGodowns(companyId: string): GodownRecord[] {
    return this.repo.listGodowns(companyId);
  }

  createGodown(companyId: string, name: string, address?: string, parentId?: string): GodownRecord {
    return this.repo.createGodown({ companyId, name, address, parentId });
  }

  listStockItems(companyId: string) {
    return this.repo.listStockItems(companyId);
  }

  createStockItem(companyId: string, raw: z.infer<typeof createStockItemSchema>): StockItemRecord {
    const input = createStockItemSchema.parse(raw);
    return this.repo.createStockItem({ ...input, companyId });
  }

  /**
   * Value a stock item's closing stock using its costing method.
   */
  valueStockItem(
    companyId: string,
    stockItemId: string,
    asOfDate?: string,
  ): StockValuation {
    const item = this.repo.getStockItem(companyId, stockItemId);
    if (!item) throw new Error(`Stock item not found: ${stockItemId}`);

    const movements = this.repo.getStockMovements(companyId, stockItemId, asOfDate);

    // The opening balance is the first layer.
    const withOpening =
      item.opening_quantity > 0
        ? [
            {
              id: `opening:${item.id}`,
              date: '0000-01-01',
              direction: 'Inward' as const,
              quantity: item.opening_quantity,
              rate: item.opening_rate,
              amount: item.opening_value,
              value: item.opening_value,
              godownId: item.opening_godown_id ?? null,
              batchId: null,
            },
            ...movements,
          ]
        : movements;

    return valueStockMovements(withOpening, {
      costingMethod: item.costing_method as CostingMethod,
      standardRate: item.opening_rate,
      allowNegativeStock: false,
    });
  }

  /**
   * Value every stock item, returning closing quantity and value per item.
   */
  valueAllStockItems(companyId: string, asOfDate?: string) {
    const items = this.repo.listStockItems(companyId);
    return items.map((item) => {
      const valuation = this.valueStockItem(companyId, item.id, asOfDate);
      return {
        stockItemId: item.id,
        name: item.name,
        unitSymbol: item.unit_symbol,
        costingMethod: item.costing_method,
        closingQuantity: valuation.closingQuantity,
        closingValue: valuation.closingValue,
        averageRate: valuation.averageRate,
        negativeStockEvents: valuation.negativeStockEvents,
      };
    });
  }

  /**
   * Explode a bill of materials for a produced item and quantity.
   */
  explodeBom(companyId: string, stockItemId: string, producedQuantity: number) {
    const boms = this.repo.getBoms(companyId, stockItemId);
    if (boms.length === 0) {
      throw new Error(`No bill of materials defined for stock item ${stockItemId}`);
    }

    const bom = boms[0];
    const components = JSON.parse(bom.components_json) as BomComponent[];

    // `produced_qty` is the output quantity for one BOM run, so scale the
    // requested quantity against it.
    const batches = producedQuantity / (bom.produced_qty || 1);

    return explodeBom({
      producedItemId: stockItemId,
      producedQuantity: batches,
      components,
    });
  }
}
