/**
 * Forex engine.
 *
 * Handles transaction-date conversion, period-end revaluation, and the
 * realised / unrealised gain-loss postings.
 *
 * Convention: the base currency is the company's currency. Foreign currency
 * amounts are held in the foreign currency's own minor units (e.g. US cents);
 * the exchange rate is stored as the value of one whole unit of foreign
 * currency in base minor units (e.g. 1 USD = 8300 paise, i.e. ₹83).
 *
 * Because the two amounts are in different scales, every conversion needs the
 * foreign currency's decimal places to scale the rate down to a per-minor-unit
 * factor. All money is integer minor units; the scaling is exact for any
 * currency whose minor unit divides into the whole unit (as they all do).
 */

export type ExchangeRateType = 'Standard' | 'Selling' | 'Buying';

export interface ExchangeRate {
  currencyId: string;
  date: string; // YYYY-MM-DD
  /** Base-currency minor units per one whole unit of foreign currency. */
  rate: number;
  type: ExchangeRateType;
}

export interface ForexAmount {
  /** Amount in the foreign currency's minor units (e.g. US cents). */
  foreignAmount: number;
  currencyId: string;
  /** Decimal places of the foreign currency (2 for USD, 0 for JPY). */
  decimals: number;
}

export interface ForexConversion {
  foreignAmount: number;
  baseAmount: number;
  rate: number;
  currencyId: string;
  date: string;
}

export interface ForexLedgerPosition {
  currencyId: string;
  ledgerId: string;
  /** Total amount held, in the foreign currency's minor units. */
  foreignAmount: number;
  /** Total base-currency amount booked against it, in base minor units. */
  baseAmount: number;
  /** Decimal places of the foreign currency. */
  decimals: number;
}

/**
 * Look up the exchange rate for a currency on a date. Falls back to the most
 * recent earlier rate when no rate exists for that exact date.
 *
 * The requested rate type is preferred, but the search falls back to the
 * Standard rate when the requested type has no rate on or before the date —
 * a missing Selling rate must not silently fail a conversion that the
 * Standard rate can serve.
 */
export function findExchangeRate(
  rates: ExchangeRate[],
  currencyId: string,
  date: string,
  type: ExchangeRateType = 'Standard',
): ExchangeRate | undefined {
  const forCurrency = rates.filter((r) => r.currencyId === currencyId);

  if (forCurrency.length === 0) return undefined;

  const pools: ExchangeRate[][] = [];
  if (type !== 'Standard') pools.push(forCurrency.filter((r) => r.type === type));
  pools.push(forCurrency.filter((r) => r.type === 'Standard'));
  if (type === 'Standard') pools.push(forCurrency);

  for (const pool of pools) {
    if (pool.length === 0) continue;

    // Exact date first, then the latest rate on or before the date.
    const exact = pool.find((r) => r.date === date);
    if (exact) return exact;

    const earlier = pool
      .filter((r) => r.date <= date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    if (earlier.length > 0) return earlier[0];
  }

  return undefined;
}

/**
 * Scale a whole-unit exchange rate to a per-minor-unit factor.
 *
 * A rate of 8300 paise per USD with 2 decimal places means 1 US cent is worth
 * 83 paise, so the factor is 8300 / 100 = 83.
 */
function perMinorUnitRate(rate: number, decimals: number): number {
  return rate / Math.pow(10, decimals);
}

/**
 * Convert a foreign-currency amount to the base currency.
 */
export function convertToBase(
  amount: ForexAmount,
  date: string,
  rates: ExchangeRate[],
  type: ExchangeRateType = 'Standard',
): ForexConversion {
  const rate = findExchangeRate(rates, amount.currencyId, date, type);

  if (!rate) {
    throw new Error(
      `No exchange rate found for currency ${amount.currencyId} on or before ${date}`,
    );
  }

  const factor = perMinorUnitRate(rate.rate, amount.decimals);

  return {
    foreignAmount: amount.foreignAmount,
    baseAmount: Math.round(amount.foreignAmount * factor),
    rate: rate.rate,
    currencyId: amount.currencyId,
    date,
  };
}

/**
 * Revalue a foreign-currency position at a new rate.
 *
 * Returns the unrealised gain (positive) or loss (negative), in base
 * currency minor units.
 */
export function revaluePosition(
  position: ForexLedgerPosition,
  newRate: number,
): { revaluedBaseAmount: number; unrealisedGain: number } {
  const factor = perMinorUnitRate(newRate, position.decimals);
  const revaluedBaseAmount = Math.round(position.foreignAmount * factor);
  const unrealisedGain = revaluedBaseAmount - position.baseAmount;
  return { revaluedBaseAmount, unrealisedGain };
}

/**
 * Compute realised gain or loss on a partial disposal of a foreign position.
 *
 * @param position  the position before the disposal
 * @param soldForeign  the foreign amount disposed, in foreign minor units
 * @param rateAtSale  the whole-unit rate on the sale date
 * @param rateAtAcquisition  the whole-unit rate the position was acquired at
 */
export function realisedGain(
  position: ForexLedgerPosition,
  soldForeign: number,
  rateAtSale: number,
  rateAtAcquisition: number,
): { proceeds: number; cost: number; gain: number } {
  // The position's average acquisition rate is used when no explicit
  // acquisition rate is supplied.
  const effectiveAcquisitionRate =
    rateAtAcquisition > 0
      ? rateAtAcquisition
      : position.foreignAmount !== 0
        ? (position.baseAmount * Math.pow(10, position.decimals)) / position.foreignAmount
        : rateAtSale;

  const saleFactor = perMinorUnitRate(rateAtSale, position.decimals);
  const costFactor = perMinorUnitRate(effectiveAcquisitionRate, position.decimals);

  const proceeds = Math.round(soldForeign * saleFactor);
  const cost = Math.round(soldForeign * costFactor);
  return { proceeds, cost, gain: proceeds - cost };
}

/**
 * Build the journal lines for a period-end revaluation.
 *
 * Unrealised gain  → debit the foreign ledger, credit the exchange variance ledger.
 * Unrealised loss  → debit the exchange variance ledger, credit the foreign ledger.
 */
export function revaluationJournalLines(input: {
  position: ForexLedgerPosition;
  newRate: number;
  varianceLedgerId: string;
}): {
  lines: { ledgerId: string; isDebit: boolean; amount: number }[];
  unrealisedGain: number;
} {
  const { unrealisedGain } = revaluePosition(input.position, input.newRate);

  if (unrealisedGain === 0) {
    return { lines: [], unrealisedGain: 0 };
  }

  if (unrealisedGain > 0) {
    return {
      lines: [
        { ledgerId: input.position.ledgerId, isDebit: true, amount: unrealisedGain },
        { ledgerId: input.varianceLedgerId, isDebit: false, amount: unrealisedGain },
      ],
      unrealisedGain,
    };
  }

  return {
    lines: [
      { ledgerId: input.varianceLedgerId, isDebit: true, amount: -unrealisedGain },
      { ledgerId: input.position.ledgerId, isDebit: false, amount: -unrealisedGain },
    ],
    unrealisedGain,
  };
}
