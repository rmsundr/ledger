import {
  InventoryRepository,
  type Db,
  type GodownRecord,
  type StockGroupRecord,
  type StockItemRecord,
  type UnitRecord,
} from '@ledgerdesk/db';
import { z } from 'zod';

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
}
