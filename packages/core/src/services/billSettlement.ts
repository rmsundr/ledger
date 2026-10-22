/**
 * Bill-wise settlement engine.
 *
 * Given the bill allocations posted against a party, works out which
 * references are still outstanding and how much of each is pending.
 *
 * Rules implemented (matching Tally's bill-wise behaviour):
 *   - A "New Ref" (or "Advance") allocation creates an open bill.
 *   - An "Agst Ref" allocation settles open bills, oldest first (FIFO).
 *   - A payment may settle only part of a bill; the remainder stays pending.
 *   - An "On Account" allocation settles the oldest open bills without
 *     naming a specific reference.
 *   - A settlement larger than the open balance is applied to the bills in
 *     order, and any excess is left unallocated (it is a party-level credit).
 *   - Debit bills (receivables) are settled by credit allocations and vice
 *     versa. An allocation of the same sense as the bill does not settle it.
 *
 * The engine is pure — the caller supplies the allocations.
 */

export type RefType = 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';

export interface BillAllocation {
  id: string;
  voucherId: string;
  date: string;
  refType: RefType;
  refName: string;
  amount: number; // minor units, always positive
  /** 1 = debit allocation, 0 = credit allocation. */
  isDebit: number;
  dueDate?: string | null;
}

export interface OpenBill {
  refName: string;
  refType: RefType;
  date: string;
  dueDate: string | null;
  amount: number;
  isDebit: number;
  /** Amount settled so far. */
  settled: number;
  /** amount - settled. */
  pending: number;
  /** Settlements applied to this bill, in order. */
  settlements: { date: string; amount: number; refName: string }[];
}

export interface SettlementResult {
  /** Bills still open after all settlements are applied. */
  openBills: OpenBill[];
  /** Total pending across all open bills. */
  totalPending: number;
  /** Total settled across all bills. */
  totalSettled: number;
  /**
   * Amount of a settlement that could not be matched to any open bill
   * (settlement exceeds the party's open balance).
   */
  unallocatedAmount: number;
}

export function settleBills(allocations: BillAllocation[]): SettlementResult {
  const ordered = [...allocations].sort(compareAllocations);

  const openBills: OpenBill[] = [];
  let totalSettled = 0;
  let unallocatedAmount = 0;

  for (const alloc of ordered) {
    if (alloc.refType === 'New Ref' || alloc.refType === 'Advance') {
      // Opening a new bill.
      openBills.push({
        refName: alloc.refName,
        refType: alloc.refType,
        date: alloc.date,
        dueDate: alloc.dueDate ?? null,
        amount: alloc.amount,
        isDebit: alloc.isDebit,
        settled: 0,
        pending: alloc.amount,
        settlements: [],
      });
      continue;
    }

    // Agst Ref / On Account — a settlement.
    // It settles bills of the opposite sense (a credit settles a debit bill).
    let remaining = alloc.amount;
    const billSense = alloc.isDebit === 1 ? 0 : 1;

    for (const bill of openBills) {
      if (remaining <= 0) break;
      if (bill.isDebit !== billSense) continue;
      if (bill.pending <= 0) continue;

      const applied = Math.min(bill.pending, remaining);
      bill.settled += applied;
      bill.pending -= applied;
      bill.settlements.push({ date: alloc.date, amount: applied, refName: alloc.refName });
      remaining -= applied;
      totalSettled += applied;
    }

    if (remaining > 0) {
      unallocatedAmount += remaining;
    }
  }

  const stillOpen = openBills.filter((b) => b.pending > 0);

  return {
    openBills: stillOpen,
    totalPending: stillOpen.reduce((sum, b) => sum + b.pending, 0),
    totalSettled,
    unallocatedAmount,
  };
}

function compareAllocations(a: BillAllocation, b: BillAllocation): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // On a given date, openings come before settlements so that a payment
  // made on the same day as the bill settles that bill.
  const aOpens = a.refType === 'New Ref' || a.refType === 'Advance';
  const bOpens = b.refType === 'New Ref' || b.refType === 'Advance';
  if (aOpens !== bOpens) return aOpens ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Split a settlement amount across open bills, oldest first.
 * Used to preview how a payment would be allocated before it is posted.
 */
export function previewAllocation(
  openBills: { refName: string; pending: number; dueDate: string | null; date: string }[],
  amount: number,
): { refName: string; amount: number }[] {
  const ordered = [...openBills]
    .filter((b) => b.pending > 0)
    .sort((a, b) => {
      const aDue = a.dueDate ?? a.date;
      const bDue = b.dueDate ?? b.date;
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

  const result: { refName: string; amount: number }[] = [];
  let remaining = amount;

  for (const bill of ordered) {
    if (remaining <= 0) break;
    const applied = Math.min(bill.pending, remaining);
    result.push({ refName: bill.refName, amount: applied });
    remaining -= applied;
  }

  return result;
}

/**
 * Ageing buckets for a set of open bills.
 *
 * `bucketDays` defines the upper bound (in days) of each bucket, oldest last.
 * Bills not yet due fall into the first bucket.
 */
export interface AgeingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
}

export const DEFAULT_AGEING_BUCKETS: AgeingBucket[] = [
  { label: 'Not Due', minDays: 0, maxDays: 0 },
  { label: '0-30', minDays: 1, maxDays: 30 },
  { label: '31-60', minDays: 31, maxDays: 60 },
  { label: '61-90', minDays: 61, maxDays: 90 },
  { label: '90+', minDays: 91, maxDays: null },
];

export function ageBills(
  bills: { pending: number; dueDate: string | null; date: string }[],
  asOfDate: string,
  buckets: AgeingBucket[] = DEFAULT_AGEING_BUCKETS,
): { label: string; amount: number }[] {
  const asOfMs = new Date(asOfDate).getTime();
  const result = buckets.map((b) => ({ label: b.label, amount: 0 }));

  for (const bill of bills) {
    const refDate = bill.dueDate ?? bill.date;
    const days = Math.floor((asOfMs - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));

    // Negative means not yet due.
    const index = buckets.findIndex((b) => {
      if (days < 0) return b.minDays === 0 && b.maxDays === 0;
      if (b.maxDays === null) return days >= b.minDays;
      return days >= b.minDays && days <= b.maxDays;
    });

    if (index >= 0) result[index].amount += bill.pending;
  }

  return result;
}
