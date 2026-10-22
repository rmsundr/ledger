/**
 * Stock valuation engine.
 *
 * Values closing stock by the item's costing method:
 *   - Avg Cost            running weighted average
 *   - FIFO                consume oldest cost layers first
 *   - LIFO                consume newest cost layers first
 *   - Last Purchase Cost  rate of the most recent inward movement
 *   - Std Cost            fixed standard rate carried on the item
 *   - Zero Cost           quantity only, value always nil
 *
 * The engine is pure: it takes an ordered list of movements and returns the
 * valuation. This keeps it testable and lets a back-dated insertion simply
 * re-run over the full history.
 *
 * Quantities are `number` (they may be fractional — 1.5 kg).
 * Money is integer minor units (paise). Amounts per movement are already
 * rounded to paise by the caller.
 */

export type CostingMethod =
  | 'Avg Cost'
  | 'FIFO'
  | 'LIFO'
  | 'Last Purchase Cost'
  | 'Std Cost'
  | 'Zero Cost';

export interface StockMovement {
  id: string;
  date: string; // YYYY-MM-DD
  /** Inward adds stock, Outward removes it. */
  direction: 'Inward' | 'Outward';
  quantity: number;
  /** Rate per unit in minor units. */
  rate: number;
  /** Total value in minor units (quantity * rate, rounded). */
  amount: number;
  /** Value actually consumed by this movement, in minor units. */
  value: number;
  godownId?: string | null;
  batchId?: string | null;
}

export interface CostLayer {
  quantity: number;
  rate: number; // minor units per unit
  value: number; // minor units
  date: string;
}

export interface ValuationResult {
  closingQuantity: number;
  closingValue: number;
  /** Closing value divided by closing quantity, in minor units. Zero when qty is 0. */
  averageRate: number;
  /** Remaining cost layers, oldest first. Empty for non-layering methods. */
  layers: CostLayer[];
  /** Issues when negative stock was allowed (quantity went below zero). */
  negativeStockEvents: { date: string; quantity: number }[];
  totalInwardQuantity: number;
  totalInwardValue: number;
  totalOutwardQuantity: number;
  totalOutwardValue: number;
}

export interface ValuationOptions {
  costingMethod: CostingMethod;
  /** Standard rate in minor units, used by Std Cost. */
  standardRate?: number;
  /** When true, outward movements exceeding available stock are allowed (quantity goes negative). */
  allowNegativeStock?: boolean;
  /**
   * When true, movements are valued within their godown independently, so
   * stock cannot be moved between godowns without an explicit transfer.
   */
  trackByGodown?: boolean;
}

const EPSILON = 1e-9;

function roundMoney(value: number): number {
  return Math.round(value);
}

/**
 * Value a sequence of stock movements.
 */
export function valueStockMovements(
  movements: StockMovement[],
  options: ValuationOptions,
): ValuationResult {
  const ordered = [...movements].sort(compareMovements);

  const result: ValuationResult = {
    closingQuantity: 0,
    closingValue: 0,
    averageRate: 0,
    layers: [],
    negativeStockEvents: [],
    totalInwardQuantity: 0,
    totalInwardValue: 0,
    totalOutwardQuantity: 0,
    totalOutwardValue: 0,
  };

  // Godown-scoped state, used when stock must not move between locations.
  const godownState = new Map<string, GodownState>();
  const globalState: GodownState = createState();

  for (const mv of ordered) {
    const state = options.trackByGodown
      ? getOrCreateGodownState(godownState, mv.godownId ?? '__none__')
      : globalState;

    if (mv.direction === 'Inward') {
      const bookedValue = applyInward(state, mv, options);
      result.totalInwardQuantity += mv.quantity;
      result.totalInwardValue += bookedValue;
    } else {
      const consumedValue = applyOutward(state, mv, options, result);
      result.totalOutwardQuantity += mv.quantity;
      result.totalOutwardValue += consumedValue;
    }
  }

  result.closingQuantity = roundQuantity(globalState.quantity);
  result.closingValue = roundMoney(globalState.value);
  result.layers = globalState.layers.map((l) => ({ ...l }));
  result.averageRate =
    result.closingQuantity > EPSILON
      ? roundMoney(result.closingValue / result.closingQuantity)
      : 0;

  return result;
}

interface GodownState {
  quantity: number;
  value: number;
  layers: CostLayer[];
  lastPurchaseRate: number;
}

function createState(): GodownState {
  return { quantity: 0, value: 0, layers: [], lastPurchaseRate: 0 };
}

function getOrCreateGodownState(map: Map<string, GodownState>, key: string): GodownState {
  let state = map.get(key);
  if (!state) {
    state = createState();
    map.set(key, state);
  }
  return state;
}

function compareMovements(a: StockMovement, b: StockMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Within the same date, inward movements are consumed first so that an
  // outward on the same day never dips into negative stock unnecessarily.
  if (a.direction !== b.direction) return a.direction === 'Inward' ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Apply an inward movement to the state and return the value booked.
 *
 * The booked value is the one the costing method implies, which is not always
 * the voucher's amount — under Std Cost the standard rate wins, and under
 * Zero Cost the value is always nil.
 */
function applyInward(state: GodownState, mv: StockMovement, options: ValuationOptions): number {
  switch (options.costingMethod) {
    case 'Zero Cost':
      state.quantity += mv.quantity;
      state.value += 0;
      state.layers.push({
        quantity: mv.quantity,
        rate: 0,
        value: 0,
        date: mv.date,
      });
      return 0;

    case 'Std Cost': {
      const rate = options.standardRate ?? 0;
      const value = roundMoney(mv.quantity * rate);
      state.quantity += mv.quantity;
      state.value += value;
      state.layers.push({ quantity: mv.quantity, rate, value, date: mv.date });
      return value;
    }

    case 'Last Purchase Cost': {
      const rate = mv.rate;
      const value = roundMoney(mv.quantity * rate);
      state.quantity += mv.quantity;
      state.value += value;
      state.lastPurchaseRate = rate;
      state.layers.push({ quantity: mv.quantity, rate, value, date: mv.date });
      return value;
    }

    case 'Avg Cost': {
      const value = mv.amount;
      state.quantity += mv.quantity;
      state.value += value;
      const newQty = state.quantity;
      if (newQty > EPSILON) {
        // Re-price every open layer at the new average.
        const avg = state.value / newQty;
        for (const layer of state.layers) {
          layer.rate = roundMoney(avg);
          layer.value = roundMoney(layer.quantity * layer.rate);
        }
      }
      return value;
    }

    case 'FIFO':
    case 'LIFO':
    default: {
      const value = mv.amount;
      state.quantity += mv.quantity;
      state.value += value;
      state.layers.push({
        quantity: mv.quantity,
        rate: mv.rate,
        value,
        date: mv.date,
      });
      return value;
    }
  }
}

/**
 * Apply an outward movement to the state and return the value consumed.
 */
function applyOutward(
  state: GodownState,
  mv: StockMovement,
  options: ValuationOptions,
  result: ValuationResult,
): number {
  const quantity = mv.quantity;

  if (options.costingMethod === 'Zero Cost') {
    state.quantity -= quantity;
    consumeLayers(state, quantity, 'FIFO', 0);
    mv.value = 0;
    return 0;
  }

  if (options.costingMethod === 'Std Cost') {
    const rate = options.standardRate ?? 0;
    const value = roundMoney(quantity * rate);
    state.quantity -= quantity;
    state.value -= value;
    consumeLayers(state, quantity, 'FIFO', rate);
    mv.value = value;
    return value;
  }

  if (options.costingMethod === 'Last Purchase Cost') {
    const rate = state.lastPurchaseRate;
    const value = roundMoney(quantity * rate);
    state.quantity -= quantity;
    state.value -= value;
    consumeLayers(state, quantity, 'FIFO', rate);
    mv.value = value;
    return value;
  }

  if (options.costingMethod === 'Avg Cost') {
    const avg = state.quantity > EPSILON ? state.value / state.quantity : 0;
    const value = roundMoney(quantity * avg);
    state.quantity -= quantity;
    state.value -= value;
    consumeLayers(state, quantity, 'FIFO', roundMoney(avg));
    mv.value = value;
    if (state.quantity < -EPSILON) {
      result.negativeStockEvents.push({ date: mv.date, quantity: roundQuantity(state.quantity) });
      if (!options.allowNegativeStock) {
        state.quantity = 0;
        state.value = 0;
      }
    }
    return value;
  }

  // FIFO / LIFO: consume real cost layers.
  const order = options.costingMethod === 'LIFO' ? 'LIFO' : 'FIFO';
  const value = consumeLayers(state, quantity, order, 0, true);
  state.quantity -= quantity;
  state.value -= value;
  mv.value = value;

  if (state.quantity < -EPSILON) {
    result.negativeStockEvents.push({ date: mv.date, quantity: roundQuantity(state.quantity) });
    if (!options.allowNegativeStock) {
      state.quantity = 0;
      state.value = 0;
    }
  }

  return value;
}

/**
 * Consume `quantity` from the cost layers.
 *
 * Returns the value consumed. When `valueFromLayers` is false the caller
 * supplies the rate directly (used by the rate-based methods).
 */
function consumeLayers(
  state: GodownState,
  quantity: number,
  order: 'FIFO' | 'LIFO',
  fallbackRate: number,
  valueFromLayers = false,
): number {
  let remaining = quantity;
  let value = 0;

  while (remaining > EPSILON && state.layers.length > 0) {
    const layer = order === 'FIFO' ? state.layers[0] : state.layers[state.layers.length - 1];
    const take = Math.min(layer.quantity, remaining);

    if (valueFromLayers && layer.quantity > EPSILON) {
      // Take this layer's own value pro-rated to the quantity consumed.
      const layerValue = (layer.value * take) / layer.quantity;
      value += layerValue;
      layer.value -= layerValue;
    } else {
      value += take * fallbackRate;
    }

    layer.quantity -= take;
    remaining -= take;

    if (layer.quantity <= EPSILON) {
      if (order === 'FIFO') {
        state.layers.shift();
      } else {
        state.layers.pop();
      }
    }
  }

  // Any quantity beyond available layers is valued at the fallback rate.
  if (remaining > EPSILON) {
    value += remaining * fallbackRate;
  }

  return roundMoney(value);
}

function roundQuantity(qty: number): number {
  return Math.round(qty * 1e6) / 1e6;
}

/**
 * Explode a bill of materials into its component requirements.
 *
 * `components` is the JSON stored on `stock_item_bom.components_json`:
 *   [{ stockItemId, quantity, unitId?, rate? }, ...]
 *
 * The result lists the total requirement for each component, taking the
 * number of units to produce into account.
 */
export interface BomComponent {
  stockItemId: string;
  quantity: number;
  rate?: number;
  unitId?: string;
}

export interface BomExplosionLine {
  stockItemId: string;
  requiredQuantity: number;
  rate: number;
  amount: number;
}

export interface BomExplosion {
  producedItemId: string;
  producedQuantity: number;
  lines: BomExplosionLine[];
  totalComponentValue: number;
}

export function explodeBom(input: {
  producedItemId: string;
  producedQuantity: number;
  components: BomComponent[];
}): BomExplosion {
  const scale = input.producedQuantity;

  // Aggregate repeated components.
  const aggregated = new Map<string, { quantity: number; rate: number; unitId?: string }>();
  for (const c of input.components) {
    const existing = aggregated.get(c.stockItemId);
    if (existing) {
      existing.quantity += c.quantity;
    } else {
      aggregated.set(c.stockItemId, {
        quantity: c.quantity,
        rate: c.rate ?? 0,
        unitId: c.unitId,
      });
    }
  }

  const lines: BomExplosionLine[] = [];
  let totalComponentValue = 0;

  for (const [stockItemId, agg] of aggregated) {
    const requiredQuantity = roundQuantity(agg.quantity * scale);
    const amount = roundMoney(requiredQuantity * agg.rate);
    totalComponentValue += amount;

    lines.push({
      stockItemId,
      requiredQuantity,
      rate: agg.rate,
      amount,
    });
  }

  return {
    producedItemId: input.producedItemId,
    producedQuantity: scale,
    lines,
    totalComponentValue,
  };
}
