import {
  PayrollRepository,
  type Db,
  type EmployeeRecord,
  type PayHeadRecord,
} from '@ledgerdesk/db';
import { z } from 'zod';

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

  constructor(db: Db) {
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
}
