/**
 * Interest calculation engine.
 *
 * Computes interest on outstanding bills (or on ledger balances) according
 * to a per-ledger interest rule, and can generate the journal voucher that
 * books the accrued interest.
 *
 * Supported interest styles:
 *   - 365-day Year  simple/compound on an actual/365 basis
 *   - 360-day Year  actual/360 basis
 *   - Calendar Month monthly compounding
 *   - Calendar Year  annual compounding
 *
 * The base is the amount pending on the bill; the period runs from the
 * due date (or voucher date) to the as-of date, after any grace days.
 */

export type InterestStyle =
  | '365-day Year'
  | '360-day Year'
  | 'Calendar Month'
  | 'Calendar Year';

export type InterestBasis = 'Voucher Date' | 'Due Date';

export interface InterestRule {
  ratePercent: number;
  interestStyle: InterestStyle;
  calculateFrom: InterestBasis;
  graceDays: number;
  /** When true, interest compounds on the accrued interest. */
  compound: boolean;
  /** When true, interest is computed on the ledger's running balance. */
  onBalance?: boolean;
  /**
   * The sense of the party's balance.
   *
   * `true`  — the party owes us (a receivable). Accrued interest increases
   *            what they owe, so the party is debited and income credited.
   * `false` — we owe the party (a payable). Accrued interest increases what
   *            we owe, so the party is credited and the interest ledger
   *            debited.
   *
   * Defaults to `true` when not specified.
   */
  isReceivable?: boolean;
}

export interface InterestBill {
  refName: string;
  partyLedgerId: string;
  amount: number; // pending amount in minor units
  date: string; // bill date
  dueDate: string | null;
}

export interface InterestLine {
  refName: string;
  partyLedgerId: string;
  principal: number;
  fromDate: string;
  toDate: string;
  days: number;
  ratePercent: number;
  interest: number;
}

export interface InterestResult {
  lines: InterestLine[];
  totalInterest: number;
  /** Journal lines to book the accrued interest. */
  journalLines: { ledgerId: string; isDebit: boolean; amount: number }[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

function addDays(date: string, days: number): string {
  const ms = new Date(date).getTime() + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Compute interest for a single bill.
 */
export function computeBillInterest(
  bill: InterestBill,
  rule: InterestRule,
  asOfDate: string,
): InterestLine {
  const base = rule.calculateFrom === 'Due Date' ? (bill.dueDate ?? bill.date) : bill.date;

  // Grace days push the start of the interest period.
  const fromDate = rule.graceDays > 0 ? addDays(base, rule.graceDays) : base;

  const days = Math.max(0, daysBetween(fromDate, asOfDate));

  if (days === 0 || bill.amount <= 0 || rule.ratePercent <= 0) {
    return {
      refName: bill.refName,
      partyLedgerId: bill.partyLedgerId,
      principal: bill.amount,
      fromDate,
      toDate: asOfDate,
      days,
      ratePercent: rule.ratePercent,
      interest: 0,
    };
  }

  let interest: number;

  switch (rule.interestStyle) {
    case '360-day Year': {
      interest = Math.round((bill.amount * rule.ratePercent * days) / (100 * 360));
      break;
    }

    case 'Calendar Month': {
      // Compound on a monthly basis: (1 + r/12) ^ months - 1
      const months = Math.max(1, Math.ceil(days / 30));
      const monthlyRate = rule.ratePercent / 100 / 12;
      const factor = rule.compound
        ? Math.pow(1 + monthlyRate, months) - 1
        : (monthlyRate * months);
      interest = Math.round(bill.amount * factor);
      break;
    }

    case 'Calendar Year': {
      const years = Math.max(1, Math.ceil(days / 365));
      const annualRate = rule.ratePercent / 100;
      const factor = rule.compound ? Math.pow(1 + annualRate, years) - 1 : annualRate * years;
      interest = Math.round(bill.amount * factor);
      break;
    }

    case '365-day Year':
    default: {
      if (rule.compound) {
        // Compound annually: (1 + r)^(days/365) - 1
        const years = days / 365;
        const factor = Math.pow(1 + rule.ratePercent / 100, years) - 1;
        interest = Math.round(bill.amount * factor);
      } else {
        interest = Math.round((bill.amount * rule.ratePercent * days) / (100 * 365));
      }
      break;
    }
  }

  return {
    refName: bill.refName,
    partyLedgerId: bill.partyLedgerId,
    principal: bill.amount,
    fromDate,
    toDate: asOfDate,
    days,
    ratePercent: rule.ratePercent,
    interest,
  };
}

/**
 * Compute interest across a set of bills, grouped by party, and build the
 * journal lines to book the accrual.
 *
 * The journal is balanced: the total debited always equals the total credited.
 * For receivables the party is debited (they owe more) and the interest
 * income credited; for payables the party is credited (we owe more) and the
 * interest expense debited.
 */
export function computeInterest(
  bills: InterestBill[],
  rules: Map<string, InterestRule>,
  asOfDate: string,
  journalOptions: { interestLedgerId: string; incomeLedgerId: string },
): InterestResult {
  const lines: InterestLine[] = [];

  for (const bill of bills) {
    const rule = rules.get(bill.partyLedgerId);
    if (!rule) continue;
    lines.push(computeBillInterest(bill, rule, asOfDate));
  }

  const totalInterest = lines.reduce((sum, l) => sum + l.interest, 0);

  const journalLines: { ledgerId: string; isDebit: boolean; amount: number }[] = [];

  if (totalInterest > 0) {
    // Accumulate the per-party amounts first, so a party appearing on several
    // bills contributes a single journal line.
    const byParty = new Map<string, number>();
    for (const line of lines) {
      if (line.interest <= 0) continue;
      byParty.set(line.partyLedgerId, (byParty.get(line.partyLedgerId) ?? 0) + line.interest);
    }

    for (const [partyLedgerId, amount] of byParty) {
      const rule = rules.get(partyLedgerId);
      const isReceivable = rule?.isReceivable ?? true;
      journalLines.push({
        ledgerId: partyLedgerId,
        // Receivable: the party owes us more, so debit them.
        // Payable: we owe the party more, so credit them.
        isDebit: isReceivable,
        amount,
      });
    }

    // The counter-leg: interest income for receivables, interest expense for
    // payables. `interestLedgerId` is used when it differs from the income
    // ledger so the caller can book the two senses into separate ledgers.
    const hasPayable = Array.from(byParty.keys()).some(
      (id) => !(rules.get(id)?.isReceivable ?? true),
    );
    const hasReceivable = Array.from(byParty.keys()).some(
      (id) => rules.get(id)?.isReceivable ?? true,
    );

    if (hasReceivable) {
      journalLines.push({
        ledgerId: journalOptions.incomeLedgerId,
        isDebit: false,
        amount: totalReceivableInterest(byParty, rules),
      });
    }

    if (hasPayable) {
      journalLines.push({
        ledgerId: journalOptions.interestLedgerId,
        isDebit: true,
        amount: totalPayableInterest(byParty, rules),
      });
    }
  }

  return { lines, totalInterest, journalLines };
}

function totalReceivableInterest(
  byParty: Map<string, number>,
  rules: Map<string, InterestRule>,
): number {
  let sum = 0;
  for (const [id, amount] of byParty) {
    if (rules.get(id)?.isReceivable ?? true) sum += amount;
  }
  return sum;
}

function totalPayableInterest(
  byParty: Map<string, number>,
  rules: Map<string, InterestRule>,
): number {
  let sum = 0;
  for (const [id, amount] of byParty) {
    if (!(rules.get(id)?.isReceivable ?? true)) sum += amount;
  }
  return sum;
}
