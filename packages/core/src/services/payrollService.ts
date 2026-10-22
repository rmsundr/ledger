import {
  PayrollRepository,
  type Db,
  type EmployeeRecord,
  type PayHeadRecord,
} from '@ledgerdesk/db';
import { z } from 'zod';
import {
  computeEmployeePayroll,
  type CalculationType,
  type EmployeePayrollResult,
  type PayHeadType,
  type StatutoryConfig,
} from './payrollEngine.js';

export interface PayrollRunSummary {
  runId: string;
  periodMonth: string;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employees: EmployeePayrollResult[];
}

export const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  empCode: z.string().min(1, 'Employee code is required'),
  groupId: z.string().optional(),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  designation: z.string().optional(),
  location: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  bankIfsc: z.string().optional(),
  pan: z.string().optional(),
  aadhaar: z.string().optional(),
  uan: z.string().optional(),
  pfNo: z.string().optional(),
  esiNo: z.string().optional(),
});

export const createPayHeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  payHeadType: z.enum([
    'Earnings for Employees',
    'Deductions from Employees',
    'Employees Statutory Deductions',
    'Employer Statutory Contributions',
    'Reimbursements',
    'Loans and Advances',
  ]),
  incomeType: z.enum(['Fixed', 'Variable']).optional().default('Fixed'),
  ledgerId: z.string().min(1, 'Associated ledger is required'),
  calculationType: z.enum(['Flat Rate', 'On Attendance', 'As Computed Value', 'On Production']),
  attendanceType: z.string().optional(),
  computationFormula: z.string().optional(),
});

export class PayrollService {
  private repo: PayrollRepository;

  constructor(private readonly db: Db) {
    this.repo = new PayrollRepository(db);
  }

  listEmployees(companyId: string): EmployeeRecord[] {
    return this.repo.listEmployees(companyId);
  }

  createEmployee(companyId: string, raw: z.infer<typeof createEmployeeSchema>): EmployeeRecord {
    const input = createEmployeeSchema.parse(raw);
    return this.repo.createEmployee({ ...input, companyId });
  }

  listPayHeads(companyId: string): PayHeadRecord[] {
    return this.repo.listPayHeads(companyId);
  }

  createPayHead(companyId: string, raw: z.infer<typeof createPayHeadSchema>): PayHeadRecord {
    const input = createPayHeadSchema.parse(raw);
    return this.repo.createPayHead({ ...input, companyId });
  }

  getSalaryStructure(employeeId: string) {
    return this.repo.getSalaryStructure(employeeId);
  }

  setSalaryStructure(employeeId: string, payHeadId: string, effectiveFrom: string, amount: number) {
    this.repo.setSalaryStructure(employeeId, payHeadId, effectiveFrom, amount);
  }

  recordAttendance(companyId: string, employeeId: string, date: string, attendanceType: string, value = 1) {
    this.repo.recordAttendance(companyId, employeeId, date, attendanceType, value);
  }

  getMonthlyAttendance(companyId: string, employeeId: string, yearMonth: string) {
    return this.repo.getMonthlyAttendance(companyId, employeeId, yearMonth);
  }

  /**
   * Run payroll for a month and persist the result.
   *
   * `periodMonth` is `YYYY-MM`. The salary structure is resolved as of the
   * last day of that month. Re-running the same month replaces the previous
   * run so the result is never double counted.
   */
  runPayroll(
    companyId: string,
    periodMonth: string,
    options?: { statutory?: StatutoryConfig; postVoucher?: boolean },
  ): PayrollRunSummary {
    if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
      throw new Error(`Invalid payroll period "${periodMonth}" — expected YYYY-MM`);
    }

    const periodEnd = `${periodMonth}-31`;
    const employees = this.repo.listEmployees(companyId);

    const results: EmployeePayrollResult[] = [];

    for (const emp of employees) {
      // Skip employees who had already left before the period began.
      const leaving = (emp as unknown as { date_of_leaving?: string | null }).date_of_leaving;
      if (leaving && leaving < `${periodMonth}-01`) continue;

      const structure = this.repo.getSalaryStructureAsOf(emp.id, periodEnd);
      if (structure.length === 0) continue;

      const presentDays = this.repo.getMonthlyAttendance(companyId, emp.id, periodMonth);

      results.push(
        computeEmployeePayroll({
          employeeId: emp.id,
          employeeName: emp.name,
          empCode: emp.emp_code,
          presentDays,
          structure: structure.map((s) => ({
            pay_head_id: s.pay_head_id,
            pay_head_name: s.pay_head_name,
            pay_head_type: s.pay_head_type as PayHeadType,
            calculation_type: s.calculation_type as CalculationType,
            attendance_type: s.attendance_type,
            computation_formula: s.computation_formula,
            amount: s.amount,
          })),
          statutory: options?.statutory,
        }),
      );
    }

    const totalGross = results.reduce((s, r) => s + r.grossPay, 0);
    const totalDeductions = results.reduce((s, r) => s + r.totalDeductions, 0);
    const totalNet = results.reduce((s, r) => s + r.netPay, 0);

    const run = this.db.transaction(() => {
      // Replace any existing run for the period so payroll is never double counted.
      const existing = this.repo.getPayrollRun(companyId, periodMonth);
      if (existing) {
        this.db.prepare(`DELETE FROM payroll_run WHERE id = ?`).run(existing.id);
      }

      const created = this.repo.createPayrollRun({
        companyId,
        periodMonth,
        totalGross,
        totalDeductions,
        totalNet,
      });

      for (const r of results) {
        this.repo.createPayrollLine({
          payrollRunId: created.id,
          employeeId: r.employeeId,
          grossPay: r.grossPay,
          deductions: r.totalDeductions,
          netPay: r.netPay,
          breakdownJson: JSON.stringify(r.breakdown),
        });
      }

      return created.id;
    });

    const runId = run();

    return {
      runId,
      periodMonth,
      employeeCount: results.length,
      totalGross,
      totalDeductions,
      totalNet,
      employees: results,
    };
  }

  getPayrollRun(companyId: string, periodMonth: string) {
    return this.repo.getPayrollRun(companyId, periodMonth);
  }

  listPayrollRuns(companyId: string) {
    return this.repo.listPayrollRuns(companyId);
  }

  /**
   * Build a bank transfer file (CSV) for the payroll run, for bulk credit upload.
   */
  buildBankTransferCsv(companyId: string, periodMonth: string): string {
    const run = this.repo.getPayrollRun(companyId, periodMonth);
    if (!run || !run.lines) {
      throw new Error(`No payroll run found for ${periodMonth}`);
    }

    const header = ['Employee Code', 'Employee Name', 'Account Number', 'IFSC', 'Bank', 'Amount'];
    const rows = run.lines.map((l) => {
      const line = l as unknown as {
        emp_code: string;
        employee_name: string;
        bank_account_no: string;
        bank_ifsc: string;
        bank_name: string;
        net_pay: number;
      };
      return [
        line.emp_code,
        line.employee_name,
        line.bank_account_no,
        line.bank_ifsc,
        line.bank_name,
        (line.net_pay / 100).toFixed(2),
      ];
    });

    return [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
}
