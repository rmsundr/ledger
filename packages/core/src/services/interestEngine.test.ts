import { describe, expect, it } from 'vitest';
import {
  computeBillInterest,
  computeInterest,
} from './interestEngine.js';
import type { InterestBill, InterestRule } from './interestEngine.js';

describe('interestEngine', () => {
  it('returns zero interest when there are no days', () => {
    const bill: InterestBill = {
      refName: 'INV-1',
      partyLedgerId: 'l1',
      amount: 100000, // ₹1,000.00 in minor units
      date: '2025-04-01',
      dueDate: null,
    };
    const rule: InterestRule = {
      ratePercent: 12,
      interestStyle: '365-day Year',
      calculateFrom: 'Due Date',
      graceDays: 0,
      compound: false,
    };
    const line = computeBillInterest(bill, rule, '2025-04-01');
    expect(line.interest).toBe(0);
    expect(line.days).toBe(0);
  });

  it('computes simple interest on actual/365', () => {
    // 30 days @ 1% on ₹10,000 = 10,000 * 1% * 30 / 365 = 82 (rounded)
    const bill: InterestBill = {
      refName: 'INV-1',
      partyLedgerId: 'l1',
      amount: 10000,
      date: '2025-04-01',
      dueDate: '2025-04-01',
    };
    const rule: InterestRule = {
      ratePercent: 1,
      interestStyle: '365-day Year',
      calculateFrom: 'Due Date',
      graceDays: 0,
      compound: false,
    };
    const line = computeBillInterest(bill, rule, '2025-04-30');
    expect(line.days).toBe(29); // April has 30 days; from April 1 to April 30 is 29 days remaining
    expect(line.interest).toBeGreaterThan(0);
    // Recompute expected manually: daysBetween uses floor((to - from)/msPerDay)
    // to - from = 29 days → interest = round(10000 * 1% * 29 / 365) = round(7.945) = 8
    expect(line.interest).toBe(8);
  });

  it('honours grace days by delaying the start of interest', () => {
    const bill: InterestBill = {
      refName: 'INV-1',
      partyLedgerId: 'l1',
      amount: 10000,
      date: '2025-04-01',
      dueDate: '2025-04-01',
    };
    // A 5-day grace means interest starts on the 6th, so only 24 days of
    // interest accrue up to 30 April.
    const rule: InterestRule = {
      ratePercent: 1,
      interestStyle: '365-day Year',
      calculateFrom: 'Due Date',
      graceDays: 5,
      compound: false,
    };
    const line = computeBillInterest(bill, rule, '2025-04-30');
    expect(line.fromDate).toBe('2025-04-06');
    expect(line.days).toBe(24);
    expect(line.interest).toBe(7); // 10000 * 1% * 24 / 365 = 6.58 → 7
  });

  it('distributes journal lines so debits equal credits', () => {
    const bills: InterestBill[] = [
      { refName: 'A', partyLedgerId: 'p1', amount: 10000, date: '2025-04-01', dueDate: '2025-04-01' },
      { refName: 'B', partyLedgerId: 'p2', amount: 20000, date: '2025-04-01', dueDate: '2025-04-01' },
    ];
    const rules = new Map<string, InterestRule>([
      ['p1', { ratePercent: 10, interestStyle: '365-day Year', calculateFrom: 'Voucher Date', graceDays: 0, compound: false, isReceivable: true }],
      ['p2', { ratePercent: 10, interestStyle: '365-day Year', calculateFrom: 'Due Date', graceDays: 0, compound: false, isReceivable: true }],
    ]);
    const result = computeInterest(bills, rules, '2025-04-30', { interestLedgerId: 'income', incomeLedgerId: 'income' });
    const debitTotal = result.journalLines.filter((j) => j.isDebit).reduce((s, j) => s + j.amount, 0);
    const creditTotal = result.journalLines.filter((j) => !j.isDebit).reduce((s, j) => s + j.amount, 0);
    expect(debitTotal).toBe(creditTotal);
  });
});
