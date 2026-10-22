import { describe, expect, it } from 'vitest';
import { explodeBom, valueStockMovements } from './stockValuation.js';
import type { StockMovement } from './stockValuation.js';

function inward(id: string, date: string, quantity: number, rate: number): StockMovement {
  return {
    id,
    date,
    direction: 'Inward',
    quantity,
    rate,
    amount: Math.round(quantity * rate),
    value: Math.round(quantity * rate),
    godownId: null,
    batchId: null,
  };
}

function outward(id: string, date: string, quantity: number, rate: number): StockMovement {
  return {
    id,
    date,
    direction: 'Outward',
    quantity,
    rate,
    amount: Math.round(quantity * rate),
    value: 0,
    godownId: null,
    batchId: null,
  };
}

describe('stockValuation', () => {
  it('values closing stock with Avg Cost as a weighted average', () => {
    const movements = [
      inward('a', '2025-04-01', 100, 1000), // 100 units @ ₹10.00
      inward('b', '2025-04-05', 100, 2000), // 100 units @ ₹20.00
      outward('c', '2025-04-10', 100, 0),
    ];
    const result = valueStockMovements(movements, { costingMethod: 'Avg Cost' });

    // Total in = 100*1000 + 100*2000 = 300000 minor units
    // Avg rate = 300000 / 200 = 1500 per unit
    // Issue of 100 units consumes 100 * 1500 = 150000
    expect(result.totalInwardQuantity).toBe(200);
    expect(result.totalInwardValue).toBe(300000);
    expect(result.totalOutwardQuantity).toBe(100);
    expect(result.totalOutwardValue).toBe(150000);
    expect(result.closingQuantity).toBe(100);
    expect(result.closingValue).toBe(150000);
    expect(result.averageRate).toBe(1500);
  });

  it('consumes the oldest cost layer first under FIFO', () => {
    const movements = [
      inward('a', '2025-04-01', 10, 1000),
      inward('b', '2025-04-02', 10, 3000),
      outward('c', '2025-04-03', 12, 0),
    ];
    const result = valueStockMovements(movements, { costingMethod: 'FIFO' });

    // FIFO: 10 units @ 1000 = 10000, plus 2 units @ 3000 = 6000 → 16000 consumed
    expect(result.totalOutwardValue).toBe(16000);
    expect(result.closingQuantity).toBe(8);
    expect(result.closingValue).toBe(8 * 3000);
  });

  it('consumes the newest cost layer first under LIFO', () => {
    const movements = [
      inward('a', '2025-04-01', 10, 1000),
      inward('b', '2025-04-02', 10, 3000),
      outward('c', '2025-04-03', 12, 0),
    ];
    const result = valueStockMovements(movements, { costingMethod: 'LIFO' });

    // LIFO: 10 units @ 3000 = 30000, plus 2 units @ 1000 = 2000 → 32000 consumed
    expect(result.totalOutwardValue).toBe(32000);
    expect(result.closingQuantity).toBe(8);
    expect(result.closingValue).toBe(8 * 1000);
  });

  it('values issues at the last purchase rate under Last Purchase Cost', () => {
    const movements = [
      inward('a', '2025-04-01', 10, 1000),
      inward('b', '2025-04-02', 10, 3000),
      outward('c', '2025-04-03', 5, 0),
    ];
    const result = valueStockMovements(movements, { costingMethod: 'Last Purchase Cost' });

    // Issues are valued at the most recent inward rate (3000), not the average
    expect(result.totalOutwardValue).toBe(5 * 3000);
    expect(result.closingQuantity).toBe(15);
  });

  it('values everything at the standard rate under Std Cost', () => {
    const movements = [
      inward('a', '2025-04-01', 10, 9999), // ignored, standard rate wins
      outward('b', '2025-04-02', 4, 0),
    ];
    const result = valueStockMovements(movements, {
      costingMethod: 'Std Cost',
      standardRate: 2500,
    });

    expect(result.totalInwardValue).toBe(10 * 2500);
    expect(result.totalOutwardValue).toBe(4 * 2500);
    expect(result.closingValue).toBe(6 * 2500);
  });

  it('keeps values at zero under Zero Cost', () => {
    const movements = [inward('a', '2025-04-01', 10, 1000), outward('b', '2025-04-02', 4, 0)];
    const result = valueStockMovements(movements, { costingMethod: 'Zero Cost' });

    expect(result.totalInwardValue).toBe(0);
    expect(result.totalOutwardValue).toBe(0);
    expect(result.closingValue).toBe(0);
    expect(result.closingQuantity).toBe(6);
  });

  it('records a negative stock event when stock is issued beyond holdings', () => {
    const movements = [inward('a', '2025-04-01', 5, 1000), outward('b', '2025-04-02', 8, 0)];
    const result = valueStockMovements(movements, { costingMethod: 'Avg Cost' });

    expect(result.negativeStockEvents).toHaveLength(1);
    expect(result.negativeStockEvents[0].quantity).toBe(-3);
    // Negative stock is clamped to zero when it is not allowed.
    expect(result.closingQuantity).toBe(0);
    expect(result.closingValue).toBe(0);
  });

  it('allows negative stock to be carried when explicitly permitted', () => {
    const movements = [inward('a', '2025-04-01', 5, 1000), outward('b', '2025-04-02', 8, 0)];
    const result = valueStockMovements(movements, {
      costingMethod: 'Avg Cost',
      allowNegativeStock: true,
    });

    expect(result.closingQuantity).toBe(-3);
  });

  it('values inward movements before outward ones on the same date', () => {
    // Both on the same date: the inward must be consumed first so the issue
    // never dips into negative stock.
    const movements = [outward('a', '2025-04-01', 5, 0), inward('b', '2025-04-01', 10, 1000)];
    const result = valueStockMovements(movements, { costingMethod: 'Avg Cost' });

    expect(result.negativeStockEvents).toHaveLength(0);
    expect(result.closingQuantity).toBe(5);
    expect(result.closingValue).toBe(5000);
  });

  it('explodes a bill of materials for the requested production quantity', () => {
    const explosion = explodeBom({
      producedItemId: 'finished',
      producedQuantity: 10,
      components: [
        { stockItemId: 'raw-a', quantity: 2, rate: 1000 },
        { stockItemId: 'raw-b', quantity: 3, rate: 500 },
        // A repeated component must be aggregated, not listed twice.
        { stockItemId: 'raw-a', quantity: 1, rate: 1000 },
      ],
    });

    expect(explosion.lines).toHaveLength(2);
    const rawA = explosion.lines.find((l) => l.stockItemId === 'raw-a')!;
    expect(rawA.requiredQuantity).toBe(30);
    expect(rawA.amount).toBe(30 * 1000);
    expect(explosion.totalComponentValue).toBe(30 * 1000 + 30 * 500);
  });
});
