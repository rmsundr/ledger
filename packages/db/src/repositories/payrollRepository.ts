import type { Db } from '../connection.js';
import { newId } from '../ids.js';
import type {
  EmployeeRecord,
  EmployeeSalaryStructureRecord,
  PayHeadRecord,
} from '../types.js';

export class PayrollRepository {
  constructor(private readonly db: Db) {}

  // Employees
  listEmployees(companyId: string): EmployeeRecord[] {
    return this.db.prepare(`SELECT * FROM employee WHERE company_id = ? ORDER BY name`).all(companyId) as EmployeeRecord[];
  }

  createEmployee(input: {
    companyId: string;
    name: string;
    empCode: string;
    groupId?: string;
    dateOfJoining: string;
    designation?: string;
    location?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    pan?: string;
    aadhaar?: string;
    uan?: string;
    pfNo?: string;
    esiNo?: string;
  }): EmployeeRecord {
    const id = newId();
    this.db.prepare(`
      INSERT INTO employee (
        id, company_id, name, emp_code, group_id, date_of_joining,
        designation, location, bank_name, bank_account_no, bank_ifsc,
        pan, aadhaar, uan, pf_no, esi_no
      ) VALUES (
        @id, @companyId, @name, @empCode, @groupId, @dateOfJoining,
        @designation, @location, @bankName, @bankAccountNo, @bankIfsc,
        @pan, @aadhaar, @uan, @pfNo, @esiNo
      )
    `).run({
      id,
      companyId: input.companyId,
      name: input.name.trim(),
      empCode: input.empCode.trim(),
      groupId: input.groupId ?? null,
      dateOfJoining: input.dateOfJoining,
      designation: input.designation ?? '',
      location: input.location ?? '',
      bankName: input.bankName ?? '',
      bankAccountNo: input.bankAccountNo ?? '',
      bankIfsc: input.bankIfsc ?? '',
      pan: input.pan ?? '',
      aadhaar: input.aadhaar ?? '',
      uan: input.uan ?? '',
      pfNo: input.pfNo ?? '',
      esiNo: input.esiNo ?? '',
    });
    return this.db.prepare(`SELECT * FROM employee WHERE id = ?`).get(id) as EmployeeRecord;
  }

  // Pay Heads
  listPayHeads(companyId: string): PayHeadRecord[] {
    return this.db.prepare(`SELECT * FROM pay_head WHERE company_id = ? ORDER BY name`).all(companyId) as PayHeadRecord[];
  }

  createPayHead(input: {
    companyId: string;
    name: string;
    payHeadType: PayHeadRecord['pay_head_type'];
    incomeType?: 'Fixed' | 'Variable';
    ledgerId: string;
    calculationType: PayHeadRecord['calculation_type'];
    attendanceType?: string;
    computationFormula?: string;
  }): PayHeadRecord {
    const id = newId();
    this.db.prepare(`
      INSERT INTO pay_head (
        id, company_id, name, pay_head_type, income_type,
        ledger_id, calculation_type, attendance_type, computation_formula
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.companyId,
      input.name.trim(),
      input.payHeadType,
      input.incomeType ?? 'Fixed',
      input.ledgerId,
      input.calculationType,
      input.attendanceType ?? null,
      input.computationFormula ?? null,
    );
    return this.db.prepare(`SELECT * FROM pay_head WHERE id = ?`).get(id) as PayHeadRecord;
  }

  // Salary Structure
  getSalaryStructure(employeeId: string): (EmployeeSalaryStructureRecord & { pay_head_name: string; pay_head_type: string })[] {
    return this.db.prepare(`
      SELECT ess.*, ph.name AS pay_head_name, ph.pay_head_type
      FROM employee_salary_structure ess
      JOIN pay_head ph ON ess.pay_head_id = ph.id
      WHERE ess.employee_id = ?
    `).all(employeeId) as (EmployeeSalaryStructureRecord & { pay_head_name: string; pay_head_type: string })[];
  }

  setSalaryStructure(employeeId: string, payHeadId: string, effectiveFrom: string, amount: number): void {
    this.db.prepare(`
      INSERT INTO employee_salary_structure (id, employee_id, pay_head_id, effective_from, amount)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, pay_head_id, effective_from)
      DO UPDATE SET amount = excluded.amount
    `).run(newId(), employeeId, payHeadId, effectiveFrom, amount);
  }

  // Attendance
  recordAttendance(companyId: string, employeeId: string, date: string, attendanceType: string, value = 1): void {
    this.db.prepare(`
      INSERT INTO attendance (id, company_id, employee_id, date, attendance_type, value)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, employee_id, date, attendance_type)
      DO UPDATE SET value = excluded.value
    `).run(newId(), companyId, employeeId, date, attendanceType, value);
  }

  getMonthlyAttendance(companyId: string, employeeId: string, yearMonth: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(value), 0) AS present_days
      FROM attendance
      WHERE company_id = ? AND employee_id = ? AND date LIKE ? AND attendance_type = 'Present'
    `).get(companyId, employeeId, `${yearMonth}%`) as { present_days: number };
    return row.present_days;
  }
}
