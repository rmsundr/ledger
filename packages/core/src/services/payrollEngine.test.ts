import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUTORY_CONFIG,
  computeEmployeePayroll,
  computeProfessionalTax,
  evaluateFormula,
  evaluatePayHead,
} from './payrollEngine.js';
import type { SalaryStructureLine } from './payrollEngine.js';

function line(overrides: Partial<SalaryStructureLine>): SalaryStructureLine {
  return {
    pay_head_id: 'ph1',
    pay_head_name: 'Basic',
    pay_head_type: 'Earnings for Employees',
    calculation_type: 'Flat Rate',
    attendance_type: null,
    computation_formula: null,
    amount: 0,
    ...overrides,
  };
}

describe('payrollEngine — formula evaluation', () => {
  it('evaluates basic arithmetic', () => {
    const values = new Map<string, number>([['basic', 10000]]);
    expect(evaluateFormula('basic + 500', values)).toBe(10500);
    expect(evaluateFormula('basic - 500', values)).toBe(9500);
    expect(evaluateFormula('basic * 2', values)).toBe(20000);
    expect(evaluateFormula('basic / 4', values)).toBe(2500);
  });

  it('honours operator precedence and parentheses', () => {
    const values = new Map<string, number>([['basic', 10000]]);
    expect(evaluateFormula('basic + 500 * 2', values)).toBe(11000);
    expect(evaluateFormula('(basic + 500) * 2', values)).toBe(21000);
  });

  it('treats a postfix percent as division by 100', () => {
    const values = new Map<string, number>([['basic', 10000]]);
    expect(evaluateFormula('basic * 10%', values)).toBe(1000);
    expect(evaluateFormula('10% * basic', values)).toBe(1000);
  });

  it('resolves unknown identifiers to zero rather than throwing', () => {
    expect(evaluateFormula('unknown + 100', new Map())).toBe(100);
  });

  it('returns zero for a formula with an unknown character', () => {
    expect(evaluateFormula('basic & 5', new Map())).toBe(0);
  });

  it('never evaluates arbitrary code', () => {
    // A constructor call must not be executed; the tokenizer rejects it.
    expect(evaluateFormula('process.exit(1)', new Map())).toBe(0);
  });
});

describe('payrollEngine — pay head evaluation', () => {
  it('uses the stored amount for a Flat Rate pay head', () => {
    const amount = evaluatePayHead(line({ calculation_type: 'Flat Rate', amount: 25000 }), {
      presentDays: 26,
      productionValue: 0,
      payHeadAmounts: new Map(),
    });
    expect(amount).toBe(25000);
  });

  it('multiplies by present days for On Attendance', () => {
    const amount = evaluatePayHead(line({ calculation_type: 'On Attendance', amount: 1000 }), {
      presentDays: 26,
      productionValue: 0,
      payHeadAmounts: new Map(),
    });
    expect(amount).toBe(26000);
  });

  it('multiplies by production value for On Production', () => {
    const amount = evaluatePayHead(line({ calculation_type: 'On Production', amount: 100 }), {
      presentDays: 26,
      productionValue: 150,
      payHeadAmounts: new Map(),
    });
    expect(amount).toBe(15000);
  });
});

describe('payrollEngine — professional tax', () => {
  it('returns zero below the first slab', () => {
    expect(computeProfessionalTax(4000)).toBe(0);
  });

  it('returns the slab amount for the band the gross falls in', () => {
    expect(computeProfessionalTax(5000)).toBe(175);
    expect(computeProfessionalTax(10000)).toBe(350);
    expect(computeProfessionalTax(15000)).toBe(525);
  });

  it('returns the top slab above the highest threshold', () => {
    expect(computeProfessionalTax(50000)).toBe(1000);
  });
});

describe('payrollEngine — employee payroll', () => {
  it('computes gross, deductions and net pay in integer minor units', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 26,
      structure: [
        line({ pay_head_id: 'basic', pay_head_name: 'Basic', amount: 200000 }),
        line({
          pay_head_id: 'da',
          pay_head_name: 'DA',
          amount: 100000,
          calculation_type: 'As Computed Value',
          computation_formula: 'basic * 50%',
        }),
      ],
    });

    // Basic 200000 + DA (200000 * 50%) = 100000 → gross 300000
    expect(result.grossPay).toBe(300000);
    expect(result.earnings).toHaveLength(2);

    // PF: min(300000, 1500000) = 300000 → 12% = 36000
    // ESI: gross 300000 <= 2100000 → 0.75% = 2250
    // PT: gross 300000 is above every slab → 1000
    expect(result.breakdown['PF (Employee)']).toBe(36000);
    expect(result.breakdown['ESI (Employee)']).toBe(2250);
    expect(result.breakdown['Professional Tax']).toBe(1000);

    expect(result.totalDeductions).toBe(36000 + 2250 + 1000);
    expect(result.netPay).toBe(result.grossPay - result.totalDeductions);
  });

  it('caps the PF base at the wage ceiling', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 26,
      structure: [line({ amount: 5000000 })], // ₹50,000
    });

    // PF base capped at 1500000 → 12% = 180000, not 12% of 5000000.
    expect(result.breakdown['PF (Employee)']).toBe(180000);
  });

  it('does not apply ESI above the ESI wage ceiling', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 26,
      structure: [line({ amount: 3000000 })], // ₹30,000 > ₹21,000
    });

    expect(result.breakdown['ESI (Employee)']).toBe(0);
    expect(result.breakdown['ESI (Employer)']).toBe(0);
  });

  it('separates employer contributions from employee deductions', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 26,
      structure: [line({ amount: 1000000 })],
    });

    // Employer contributions must not reduce net pay.
    expect(result.employerContributionTotal).toBeGreaterThan(0);
    expect(result.netPay).toBe(result.grossPay - result.totalDeductions);
    expect(result.employerContributions.every((c) => c.payHeadType === 'Employer Statutory Contributions')).toBe(true);
  });

  it('applies attendance-based earnings', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 20,
      structure: [
        line({ amount: 1000, calculation_type: 'On Attendance', attendance_type: 'Present' }),
      ],
    });

    expect(result.grossPay).toBe(20000);
    expect(result.presentDays).toBe(20);
  });

  it('produces whole minor units with no fractional paise', () => {
    const result = computeEmployeePayroll({
      employeeId: 'e1',
      employeeName: 'Asha Menon',
      empCode: 'EMP001',
      presentDays: 26,
      structure: [line({ amount: 33333 })],
      statutory: { ...DEFAULT_STATUTORY_CONFIG, pfWageCeiling: 0 },
    });

    for (const value of Object.values(result.breakdown)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
