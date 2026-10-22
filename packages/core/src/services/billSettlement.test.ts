import { describe, expect, it } from 'vitest';
import { ageBills, previewAllocation, settleBills } from './billSettlement.js';
import type { BillAllocation } from './billSettlement.js';

function newRef(
  id: string,
  date: string,
  refName: string,
  amount: number,
  isDebit = 1,
): BillAllocation {
  return {
    id,
    voucherId: `v-${id}`,
    date,
    refType: 'New Ref',
    refName,
    amount,
    isDebit,
    dueDate: null,
  };
}

function againstRef(id: string, date: string, amount: number, isDebit = 0): BillAllocation {
  return {
    id,
    voucherId: `v-${id}`,
    date,
    refType: 'Agst Ref',
    refName: 'PAY-1',
    amount,
    isDebit,
    dueDate: null,
  };
}

describe('billSettlement — settleBills', () => {
  it('reports a bill as open when nothing has settled it', () => {
    const result = settleBills([newRef('a', '2025-04-01', 'INV-1', 100000)]);

    expect(result.openBills).toHaveLength(1);
    expect(result.openBills[0].pending).toBe(100000);
    expect(result.totalPending).toBe(100000);
    expect(result.totalSettled).toBe(0);
    expect(result.unallocatedAmount).toBe(0);
  });

  it('settles a bill in full with a matching credit allocation', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-1', 100000),
      againstRef('b', '2025-04-10', 100000),
    ]);

    expect(result.openBills).toHaveLength(0);
    expect(result.totalPending).toBe(0);
    expect(result.totalSettled).toBe(100000);
    expect(result.unallocatedAmount).toBe(0);
  });

  it('leaves the remainder pending when a bill is partly settled', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-1', 100000),
      againstRef('b', '2025-04-10', 40000),
    ]);

    expect(result.openBills).toHaveLength(1);
    expect(result.openBills[0].pending).toBe(60000);
    expect(result.openBills[0].settled).toBe(40000);
    expect(result.totalSettled).toBe(40000);
  });

  it('settles the oldest bill first', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-OLD', 50000),
      newRef('b', '2025-04-05', 'INV-NEW', 70000),
      againstRef('c', '2025-04-10', 80000),
    ]);

    expect(result.openBills).toHaveLength(1);
    expect(result.openBills[0].refName).toBe('INV-NEW');
    expect(result.openBills[0].pending).toBe(40000);
    expect(result.totalSettled).toBe(80000);
  });

  it('reports the excess of a settlement as unallocated', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-1', 50000),
      againstRef('b', '2025-04-10', 80000),
    ]);

    expect(result.openBills).toHaveLength(0);
    expect(result.totalSettled).toBe(50000);
    expect(result.unallocatedAmount).toBe(30000);
  });

  it('does not let an allocation settle a bill of the same sense', () => {
    // A debit bill (receivable) must be settled by a credit allocation.
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-1', 50000, 1),
      againstRef('b', '2025-04-10', 50000, 1),
    ]);

    expect(result.openBills).toHaveLength(1);
    expect(result.openBills[0].pending).toBe(50000);
    expect(result.totalSettled).toBe(0);
    expect(result.unallocatedAmount).toBe(50000);
  });

  it('settles a bill opened on the same date as the payment', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'INV-1', 50000),
      againstRef('b', '2025-04-01', 50000),
    ]);

    expect(result.openBills).toHaveLength(0);
    expect(result.totalSettled).toBe(50000);
  });

  it('settles credit bills with debit allocations', () => {
    const result = settleBills([
      newRef('a', '2025-04-01', 'BILL-1', 50000, 0), // payable
      againstRef('b', '2025-04-10', 50000, 1), // debit allocation settles it
    ]);

    expect(result.openBills).toHaveLength(0);
    expect(result.totalSettled).toBe(50000);
  });
});

describe('billSettlement — previewAllocation', () => {
  it('splits a payment across bills oldest due date first', () => {
    const preview = previewAllocation(
      [
        { refName: 'INV-LATE', pending: 50000, dueDate: '2025-05-01', date: '2025-04-25' },
        { refName: 'INV-EARLY', pending: 30000, dueDate: '2025-04-10', date: '2025-04-01' },
      ],
      40000,
    );

    expect(preview[0]).toEqual({ refName: 'INV-EARLY', amount: 30000 });
    expect(preview[1]).toEqual({ refName: 'INV-LATE', amount: 10000 });
  });

  it('does not allocate more than the pending amount', () => {
    const preview = previewAllocation(
      [{ refName: 'INV-1', pending: 10000, dueDate: '2025-04-10', date: '2025-04-01' }],
      50000,
    );

    expect(preview).toEqual([{ refName: 'INV-1', amount: 10000 }]);
  });
});

describe('billSillsettlement — ageBills', () => {
  it('buckets bills by how overdue they are', () => {
    const buckets = ageBills(
      [
        { pending: 100, dueDate: '2025-05-01', date: '2025-04-01' }, // not due
        { pending: 200, dueDate: '2025-04-20', date: '2025-04-01' }, // 10 days
        { pending: 300, dueDate: '2025-03-20', date: '2025-03-01' }, // 40 days
        { pending: 400, dueDate: '2025-01-01', date: '2024-12-01' }, // 120 days
      ],
      '2025-04-30',
    );

    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.amount]));
    expect(byLabel['Not Due']).toBe(100);
    expect(byLabel['0-30']).toBe(200);
    expect(byLabel['31-60']).toBe(300);
    expect(byLabel['90+']).toBe(400);
  });
});
