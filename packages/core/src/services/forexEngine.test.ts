import { describe, expect, it } from 'vitest';
import {
  convertToBase,
  findExchangeRate,
  realisedGain,
  revaluationJournalLines,
  revaluePosition,
} from './forexEngine.js';
import type { ExchangeRate, ForexLedgerPosition } from './forexEngine.js';

// Rates are base minor units (paise) per one whole unit of foreign currency.
// 1 USD = 8300 paise = ₹83.00
const rates: ExchangeRate[] = [
  { currencyId: 'usd', date: '2025-04-01', rate: 8300, type: 'Standard' },
  { currencyId: 'usd', date: '2025-04-10', rate: 8400, type: 'Standard' },
  { currencyId: 'usd', date: '2025-04-10', rate: 8450, type: 'Selling' },
  { currencyId: 'eur', date: '2025-04-01', rate: 9000, type: 'Standard' },
];

describe('forexEngine — findExchangeRate', () => {
  it('finds a rate for an exact date', () => {
    const rate = findExchangeRate(rates, 'usd', '2025-04-10');
    expect(rate?.rate).toBe(8400);
  });

  it('falls back to the most recent earlier rate', () => {
    const rate = findExchangeRate(rates, 'usd', '2025-04-15');
    expect(rate?.rate).toBe(8400);
    expect(rate?.date).toBe('2025-04-10');
  });

  it('returns undefined when no rate exists on or before the date', () => {
    expect(findExchangeRate(rates, 'usd', '2025-03-01')).toBeUndefined();
  });

  it('returns undefined for an unknown currency', () => {
    expect(findExchangeRate(rates, 'gbp', '2025-04-10')).toBeUndefined();
  });

  it('prefers the requested rate type', () => {
    const rate = findExchangeRate(rates, 'usd', '2025-04-10', 'Selling');
    expect(rate?.rate).toBe(8450);
  });

  it('falls back to the standard rate when the requested type has no rate for the date', () => {
    // There is a Selling rate on 10 April but not on 1 April, so the Standard
    // rate for 1 April must be used rather than failing.
    const rate = findExchangeRate(rates, 'usd', '2025-04-01', 'Selling');
    expect(rate?.rate).toBe(8300);
  });
});

describe('forexEngine — convertToBase', () => {
  it('converts using the rate for the transaction date', () => {
    const conversion = convertToBase(
      { foreignAmount: 10000, currencyId: 'usd', decimals: 2 },
      '2025-04-01',
      rates,
    );
    // 10000 US cents = $100. At 8300 paise per dollar that is 830000 paise.
    expect(conversion.baseAmount).toBe(830000);
    expect(conversion.rate).toBe(8300);
  });

  it('scales the rate by the currency decimal places', () => {
    const conversion = convertToBase(
      { foreignAmount: 10000, currencyId: 'usd', decimals: 2 },
      '2025-04-01',
      rates,
    );
    expect(conversion.baseAmount).toBe(10000 * 83);
  });

  it('throws when no rate is available rather than guessing', () => {
    expect(() =>
      convertToBase({ foreignAmount: 100, currencyId: 'gbp', decimals: 2 }, '2025-04-01', rates),
    ).toThrow(/No exchange rate/);
  });
});

describe('forexEngine — revaluePosition', () => {
  // $100 held, booked at 8300 paise per dollar → 830000 paise.
  const position: ForexLedgerPosition = {
    currencyId: 'usd',
    ledgerId: 'ledger-1',
    foreignAmount: 10000,
    baseAmount: 830000,
    decimals: 2,
  };

  it('reports an unrealised gain when the rate rises', () => {
    const result = revaluePosition(position, 8400);
    expect(result.revaluedBaseAmount).toBe(840000);
    expect(result.unrealisedGain).toBe(10000);
  });

  it('reports an unrealised loss when the rate falls', () => {
    const result = revaluePosition(position, 8200);
    expect(result.revaluedBaseAmount).toBe(820000);
    expect(result.unrealisedGain).toBe(-10000);
  });
});

describe('forexEngine — realisedGain', () => {
  const position: ForexLedgerPosition = {
    currencyId: 'usd',
    ledgerId: 'ledger-1',
    foreignAmount: 10000,
    baseAmount: 830000,
    decimals: 2,
  };

  it('computes the gain on a partial disposal', () => {
    // Disposing $40 at 8400 against an acquisition rate of 8300.
    const result = realisedGain(position, 4000, 8400, 8300);
    expect(result.proceeds).toBe(336000);
    expect(result.cost).toBe(332000);
    expect(result.gain).toBe(4000);
  });

  it('derives the acquisition rate from the position when none is given', () => {
    const result = realisedGain(position, 4000, 8400, 0);
    // The implied whole-unit rate is 830000 * 100 / 10000 = 8300.
    expect(result.cost).toBe(332000);
    expect(result.gain).toBe(4000);
  });

  it('reports a loss when the sale rate is below the acquisition rate', () => {
    const result = realisedGain(position, 4000, 8200, 8300);
    expect(result.gain).toBe(-4000);
  });
});

describe('forexEngine — revaluationJournalLines', () => {
  const position: ForexLedgerPosition = {
    currencyId: 'usd',
    ledgerId: 'ledger-1',
    foreignAmount: 10000,
    baseAmount: 830000,
    decimals: 2,
  };

  it('debits the foreign ledger and credits variance on a gain', () => {
    const result = revaluationJournalLines({
      position,
      newRate: 8400,
      varianceLedgerId: 'variance',
    });

    expect(result.unrealisedGain).toBe(10000);
    expect(result.lines).toEqual([
      { ledgerId: 'ledger-1', isDebit: true, amount: 10000 },
      { ledgerId: 'variance', isDebit: false, amount: 10000 },
    ]);
  });

  it('reverses the sides on a loss', () => {
    const result = revaluationJournalLines({
      position,
      newRate: 8200,
      varianceLedgerId: 'variance',
    });

    expect(result.unrealisedGain).toBe(-10000);
    expect(result.lines).toEqual([
      { ledgerId: 'variance', isDebit: true, amount: 10000 },
      { ledgerId: 'ledger-1', isDebit: false, amount: 10000 },
    ]);
  });

  it('produces no journal lines when the rate is unchanged', () => {
    const result = revaluationJournalLines({
      position,
      newRate: 8300,
      varianceLedgerId: 'variance',
    });

    expect(result.lines).toHaveLength(0);
    expect(result.unrealisedGain).toBe(0);
  });

  it('keeps the journal balanced', () => {
    const result = revaluationJournalLines({
      position,
      newRate: 8400,
      varianceLedgerId: 'variance',
    });

    const debits = result.lines.filter((l) => l.isDebit).reduce((s, l) => s + l.amount, 0);
    const credits = result.lines.filter((l) => !l.isDebit).reduce((s, l) => s + l.amount, 0);
    expect(debits).toBe(credits);
  });
});
