/**
 * Money helpers — amounts are always integer minor units (paise/cents).
 * Never use floating-point for currency.
 */

export type MinorUnits = bigint;

export function toMinorUnits(major: string | number, decimals = 2): MinorUnits {
  const s = typeof major === 'number' ? major.toFixed(decimals) : String(major).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid money amount: ${major}`);
  }
  const negative = s.startsWith('-');
  const abs = negative ? s.slice(1) : s;
  const [whole, frac = ''] = abs.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
  return negative ? -value : value;
}

export function fromMinorUnits(minor: MinorUnits | number | string, decimals = 2): string {
  const value = typeof minor === 'bigint' ? minor : BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function parseMinor(value: number | string | bigint): MinorUnits {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('Money minor units must be integers');
    }
    return BigInt(value);
  }
  return BigInt(value);
}
