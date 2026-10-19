export const migration006 = `-- LedgerDesk schema v6 — Payroll Module (Phase 6)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_group (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES employee_group(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS employee (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emp_code TEXT NOT NULL,
  group_id TEXT REFERENCES employee_group(id),
  date_of_joining TEXT NOT NULL,
  date_of_leaving TEXT,
  designation TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_no TEXT NOT NULL DEFAULT '',
  bank_ifsc TEXT NOT NULL DEFAULT '',
  pan TEXT NOT NULL DEFAULT '',
  aadhaar TEXT NOT NULL DEFAULT '',
  uan TEXT NOT NULL DEFAULT '',
  pf_no TEXT NOT NULL DEFAULT '',
  esi_no TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, emp_code)
);

CREATE TABLE IF NOT EXISTS pay_head (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pay_head_type TEXT NOT NULL
    CHECK (pay_head_type IN ('Earnings for Employees', 'Deductions from Employees', 'Employees Statutory Deductions', 'Employer Statutory Contributions', 'Reimbursements', 'Loans and Advances')),
  income_type TEXT NOT NULL DEFAULT 'Fixed' CHECK (income_type IN ('Fixed', 'Variable')),
  ledger_id TEXT NOT NULL REFERENCES ledger(id),
  calculation_type TEXT NOT NULL
    CHECK (calculation_type IN ('Flat Rate', 'On Attendance', 'As Computed Value', 'On Production')),
  attendance_type TEXT,
  computation_formula TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS employee_salary_structure (
  id TEXT NOT NULL PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  pay_head_id TEXT NOT NULL REFERENCES pay_head(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  UNIQUE (employee_id, pay_head_id, effective_from)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  attendance_type TEXT NOT NULL DEFAULT 'Present',
  value REAL NOT NULL DEFAULT 1,
  UNIQUE (company_id, employee_id, date, attendance_type)
);

CREATE TABLE IF NOT EXISTS payroll_run (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  voucher_id TEXT REFERENCES voucher(id) ON DELETE SET NULL,
  total_gross INTEGER NOT NULL DEFAULT 0,
  total_deductions INTEGER NOT NULL DEFAULT 0,
  total_net INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, period_month)
);

CREATE TABLE IF NOT EXISTS payroll_line (
  id TEXT NOT NULL PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_run(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employee(id),
  gross_pay INTEGER NOT NULL,
  deductions INTEGER NOT NULL,
  net_pay INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL DEFAULT '{}'
);
` as const;
