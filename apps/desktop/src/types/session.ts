export interface RegistryCompany {
  id: string;
  name: string;
  db_path: string;
  mailing_name: string;
  financial_year_begin: string;
  books_begin: string;
  last_opened_at: string | null;
  created_at: string;
}

export interface CompanyFeatures {
  company_id: string;
  maintain_accounts: number;
  maintain_inventory: number;
  integrate_accounts_inventory: number;
  multiple_currencies: number;
  bill_wise_details: number;
  cost_centres: number;
  interest_calculation: number;
  budgets_and_controls: number;
  payroll: number;
  gst: number;
  tds: number;
  tcs: number;
  vat_excise: number;
  post_dated_cheques: number;
  job_costing: number;
  debit_credit_notes: number;
  invoice_mode: number;
  optional_vouchers: number;
  memorandum_vouchers: number;
  reversing_journals: number;
  multiple_price_levels: number;
  batches: number;
  expiry_dates: number;
  manufacturing_bom: number;
  tracking_numbers: number;
  order_processing: number;
  purchase_sales_orders: number;
  additional_cost_details: number;
  actual_vs_billed_qty: number;
  rejection_in_out: number;
  zero_valued_transactions: number;
  updated_at: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  mailing_name: string;
  state: string;
  country: string;
  financial_year_begin: string;
  books_begin: string;
  gstin: string;
  company_pan: string;
}

export interface GroupRow {
  id: string;
  name: string;
  nature: string;
  parent_id: string | null;
}

export interface OpenSession {
  registryId: string;
  dbPath: string;
  company: CompanyRow;
  features: CompanyFeatures;
  groups: GroupRow[];
  currentDate: string;
  periodBegin: string;
  periodEnd: string;
}

export type Screen =
  | { id: 'select-company' }
  | { id: 'create-company' }
  | { id: 'gateway' }
  | { id: 'features' }
  | { id: 'configure' }
  | { id: 'masters' }
  | { id: 'voucher-entry'; voucherTypeName?: string }
  | { id: 'day-book' }
  | { id: 'trial-balance' }
  | { id: 'profit-loss' }
  | { id: 'balance-sheet' }
  | { id: 'ledger-statement'; ledgerId?: string }
  | { id: 'stock-summary' }
  | { id: 'outstanding' }
  | { id: 'tally-import' }
  | { id: 'placeholder'; title: string; note: string };
