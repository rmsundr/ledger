/**
 * Payroll salary-run engine.
 *
 * Computes monthly payroll for a company:
 *   - resolves each employee's salary structure as of the period end
 *   - evaluates each pay head according to its calculation type
 *   - applies statutory deductions (PF / ESI / Professional Tax)
 *   - produces gross pay, total deductions and net pay per employee
 *
 * All money is integer minor units (paise). No floating point for currency.
 */

export type PayHeadType =
  | 'Earnings for Employees'
  | 'Deductions from Employees'
  | 'Employees Statutory Deductions'
  | 'Employer Statutory Contributions'
  | 'Reimbursements'
  | 'Loans and Advances';

export type CalculationType = 'Flat Rate' | 'On Attendance' | 'As Computed Value' | 'On Production';

export interface SalaryStructureLine {
  pay_head_id: string;
  pay_head_name: string;
  pay_head_type: PayHeadType;
  calculation_type: CalculationType;
  attendance_type: string | null;
  computation_formula: string | null;
  amount: number; // minor units
}

export interface StatutoryConfig {
  /** Employee PF contribution rate as a percentage of basic+DA. */
  pfEmployeeRate: number;
  /** Employer PF contribution rate as a percentage of basic+DA. */
  pfEmployerRate: number;
  /** Total PF wage ceiling in minor units (0 = no ceiling). */
  pfWageCeiling: number;
  /** Employee ESI rate as a percentage of gross. */
  esiEmployeeRate: number;
  /** Employer ESI rate as a percentage of gross. */
  esiEmployerRate: number;
  /** ESI wage ceiling in minor units — above this, ESI does not apply. */
  esiWageCeiling: number;
  /** Professional tax monthly slabs, applied to gross. Ordered ascending by gross. */
  professionalTaxSlabs: { upTo: number; amount: number }[];
}

export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
  pfEmployeeRate: 12,
  pfEmployerRate: 12,
  pfWageCeiling: 1500000, // ₹15,000
  esiEmployeeRate: 0.75,
  esiEmployerRate: 3.25,
  esiWageCeiling: 2100000, // ₹21,000
  professionalTaxSlabs: [
    { upTo: 4166, amount: 0 },
    { upTo: 8333, amount: 175 },
    { upTo: 12500, amount: 350 },
    { upTo: 16666, amount: 525 },
    { upTo: 20833, amount: 700 },
    { upTo: 25000, amount: 875 },
    { upTo: Number.MAX_SAFE_INTEGER, amount: 1000 },
  ],
};

export interface ComputedPayHead {
  payHeadId: string;
  payHeadName: string;
  payHeadType: PayHeadType;
  amount: number; // minor units
}

export interface EmployeePayrollResult {
  employeeId: string;
  employeeName: string;
  empCode: string;
  presentDays: number;
  earnings: ComputedPayHead[];
  deductions: ComputedPayHead[];
  employerContributions: ComputedPayHead[];
  grossPay: number;
  totalDeductions: number;
  employerContributionTotal: number;
  netPay: number;
  breakdown: Record<string, number>;
}

/**
 * Evaluate a single pay head.
 *
 * - Flat Rate: the stored amount is the monthly amount.
 * - On Attendance: amount is a per-day rate, multiplied by present days.
 * - On Production: amount is a per-unit rate, multiplied by the production value.
 * - As Computed Value: a formula is evaluated over the pay head's own
 *   `computation_formula`, e.g. `basic * 0.10`. Only a small, safe
 *   arithmetic grammar is supported (no eval of arbitrary code).
 */
export function evaluatePayHead(
  line: SalaryStructureLine,
  context: {
    presentDays: number;
    productionValue: number;
    /** Amounts of other pay heads in the same run, keyed by pay head id. */
    payHeadAmounts: Map<string, number>;
  },
): number {
  switch (line.calculation_type) {
    case 'Flat Rate':
      return line.amount;

    case 'On Attendance':
      return Math.round(line.amount * context.presentDays);

    case 'On Production':
      return Math.round(line.amount * context.productionValue);

    case 'As Computed Value': {
      if (!line.computation_formula) return 0;
      return evaluateFormula(line.computation_formula, context.payHeadAmounts);
    }

    default:
      return 0;
  }
}

/**
 * Evaluate a small arithmetic formula over pay head amounts.
 *
 * Supported grammar: numbers, identifiers (pay head ids or names are resolved
 * by the caller through `values`), `+ - * / ( )`, and percentages as `x%`
 * meaning `x / 100`. Deliberately not a general expression evaluator.
 */
export function evaluateFormula(
  formula: string,
  payHeadAmounts: Map<string, number>,
): number {
  const tokenized = tokenizeFormula(formula);
  if (!tokenized) return 0;
  const tokens: string[] = tokenized;

  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function parseExpression(): number {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === '*') {
        left = left * right;
      } else {
        left = right === 0 ? 0 : left / right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    const tok = tokens[pos++];

    let value: number;

    if (tok === '(') {
      value = parseExpression();
      if (tokens[pos] === ')') pos++;
    } else if (tok === '-') {
      value = -parseFactor();
    } else if (tok === undefined) {
      value = 0;
    } else if (/^\d+(\.\d+)?$/.test(tok)) {
      value = Number(tok);
    } else {
      // Identifier — resolve to a known pay head amount, else 0.
      value = payHeadAmounts.get(tok) ?? 0;
    }

    // Postfix percent: `10%` means `10 / 100`.
    if (peek() === '%') {
      pos++;
      value = value / 100;
    }

    return value;
  }

  try {
    const result = parseExpression();
    return Number.isFinite(result) ? Math.round(result) : 0;
  } catch {
    return 0;
  }
}

function tokenizeFormula(formula: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j])) j++;
      tokens.push(formula.slice(i, j));
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < formula.length && /[A-Za-z0-9_]/.test(formula[j])) j++;
      tokens.push(formula.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '%') {
      // Percentage operator: treat as division by 100 applied to previous factor.
      tokens.push('%');
      i++;
      continue;
    }

    // Unknown character — reject the whole formula rather than guess.
    return null;
  }

  return tokens;
}

/** Apply the professional tax slab table to a monthly gross amount. */
export function computeProfessionalTax(
  grossPay: number,
  slabs: { upTo: number; amount: number }[] = DEFAULT_STATUTORY_CONFIG.professionalTaxSlabs,
): number {
  for (const slab of slabs) {
    if (grossPay <= slab.upTo) return slab.amount;
  }
  return 0;
}

/**
 * Compute payroll for one employee.
 */
export function computeEmployeePayroll(input: {
  employeeId: string;
  employeeName: string;
  empCode: string;
  presentDays: number;
  productionValue?: number;
  structure: SalaryStructureLine[];
  statutory?: StatutoryConfig;
}): EmployeePayrollResult {
  const cfg = input.statutory ?? DEFAULT_STATUTORY_CONFIG;
  const productionValue = input.productionValue ?? 0;

  const payHeadAmounts = new Map<string, number>();
  const earnings: ComputedPayHead[] = [];
  const deductions: ComputedPayHead[] = [];
  const employerContributions: ComputedPayHead[] = [];

  // Pass 1: earnings and reimbursements (they feed the statutory base).
  for (const line of input.structure) {
    if (
      line.pay_head_type !== 'Earnings for Employees' &&
      line.pay_head_type !== 'Reimbursements'
    ) {
      continue;
    }
    const amount = evaluatePayHead(line, {
      presentDays: input.presentDays,
      productionValue,
      payHeadAmounts,
    });
    payHeadAmounts.set(line.pay_head_id, amount);
    earnings.push({
      payHeadId: line.pay_head_id,
      payHeadName: line.pay_head_name,
      payHeadType: line.pay_head_type,
      amount,
    });
  }

  const grossPay = earnings.reduce((sum, e) => sum + e.amount, 0);

  // Pass 2: non-statutory deductions from employees, plus loans and advances.
  for (const line of input.structure) {
    if (
      line.pay_head_type !== 'Deductions from Employees' &&
      line.pay_head_type !== 'Loans and Advances'
    ) {
      continue;
    }
    const amount = evaluatePayHead(line, {
      presentDays: input.presentDays,
      productionValue,
      payHeadAmounts,
    });
    payHeadAmounts.set(line.pay_head_id, amount);
    deductions.push({
      payHeadId: line.pay_head_id,
      payHeadName: line.pay_head_name,
      payHeadType: line.pay_head_type,
      amount,
    });
  }

  // Pass 3: statutory deductions computed on the gross pay.
  const pfBase = Math.min(grossPay, cfg.pfWageCeiling);
  const pfEmployee = Math.round((pfBase * cfg.pfEmployeeRate) / 100);
  const pfEmployer = Math.round((pfBase * cfg.pfEmployerRate) / 100);

  const esiApplies = grossPay <= cfg.esiWageCeiling;
  const esiEmployee = esiApplies ? Math.round((grossPay * cfg.esiEmployeeRate) / 100) : 0;
  const esiEmployer = esiApplies ? Math.round((grossPay * cfg.esiEmployerRate) / 100) : 0;

  const professionalTax = computeProfessionalTax(grossPay, cfg.professionalTaxSlabs);

  deductions.push({
    payHeadId: 'statutory:pf',
    payHeadName: 'PF (Employee)',
    payHeadType: 'Employees Statutory Deductions',
    amount: pfEmployee,
  });
  deductions.push({
    payHeadId: 'statutory:esi',
    payHeadName: 'ESI (Employee)',
    payHeadType: 'Employees Statutory Deductions',
    amount: esiEmployee,
  });
  deductions.push({
    payHeadId: 'statutory:pt',
    payHeadName: 'Professional Tax',
    payHeadType: 'Employees Statutory Deductions',
    amount: professionalTax,
  });

  employerContributions.push({
    payHeadId: 'statutory:pf',
    payHeadName: 'PF (Employer)',
    payHeadType: 'Employer Statutory Contributions',
    amount: pfEmployer,
  });
  employerContributions.push({
    payHeadId: 'statutory:esi',
    payHeadName: 'ESI (Employer)',
    payHeadType: 'Employer Statutory Contributions',
    amount: esiEmployer,
  });

  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const employerContributionTotal = employerContributions.reduce((sum, c) => sum + c.amount, 0);
  const netPay = grossPay - totalDeductions;

  const breakdown: Record<string, number> = {};
  for (const e of earnings) breakdown[e.payHeadName] = (breakdown[e.payHeadName] ?? 0) + e.amount;
  for (const d of deductions) breakdown[d.payHeadName] = (breakdown[d.payHeadName] ?? 0) + d.amount;
  for (const c of employerContributions) {
    breakdown[c.payHeadName] = (breakdown[c.payHeadName] ?? 0) + c.amount;
  }
  breakdown['Gross Pay'] = grossPay;
  breakdown['Net Pay'] = netPay;

  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    empCode: input.empCode,
    presentDays: input.presentDays,
    earnings,
    deductions,
    employerContributions,
    grossPay,
    totalDeductions,
    employerContributionTotal,
    netPay,
    breakdown,
  };
}
