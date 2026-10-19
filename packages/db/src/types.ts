export type GroupNature = 'Assets' | 'Liabilities' | 'Income' | 'Expense';

export interface CompanyRecord {
  id: string;
  name: string;
  mailing_name: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  address_line4: string;
  state: string;
  country: string;
  pin: string;
  phone: string;
  email: string;
  website: string;
  financial_year_begin: string;
  books_begin: string;
  base_currency_symbol: string;
  base_currency_formal_name: string;
  base_currency_decimals: number;
  company_pan: string;
  gstin: string;
  cin: string;
  password_hash: string | null;
  is_encrypted: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CompanyFeaturesRecord {
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

export interface GroupRecord {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
  nature: GroupNature;
  is_system: number;
  behaves_like_subledger: number;
  nett_debit_credit: number;
  used_for_calculation: string | null;
  sort_order: number;
  deleted_at: string | null;
}

export interface LedgerRecord {
  id: string;
  company_id: string;
  name: string;
  alias: string;
  group_id: string;
  opening_balance: number;
  opening_is_debit: number;
  maintain_bill_by_bill: number;
  default_credit_period_days: number | null;
  inventory_values_affected: number;
  cost_centres_applicable: number;
  mailing_name: string;
  address: string;
  state: string;
  country: string;
  pin: string;
  phone: string;
  email: string;
  pan: string;
  gst_registration_type: string;
  gstin: string;
  is_system: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoucherTypeRecord {
  id: string;
  company_id: string;
  name: string;
  parent_name: string | null;
  numbering_method: 'Automatic' | 'AutomaticManualOverride' | 'Manual' | 'None';
  prefix: string;
  suffix: string;
  restart_numbering: 'Yearly' | 'Monthly' | 'Daily' | 'Never';
  prevent_duplicates: number;
  use_effective_dates: number;
  allow_zero_valued: number;
  optional_by_default: number;
  narration_per_ledger: number;
  print_after_save: number;
  is_system: number;
  deleted_at: string | null;
}

export interface VoucherRecord {
  id: string;
  company_id: string;
  voucher_type_id: string;
  voucher_type_name: string;
  voucher_number: string;
  date: string;
  effective_date: string | null;
  reference_no: string;
  reference_date: string | null;
  narration: string;
  is_invoice: number;
  is_optional: number;
  is_post_dated: number;
  is_cancelled: number;
  total_amount: number;
  guid: string | null;
  alter_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface VoucherLedgerEntryRecord {
  id: string;
  voucher_id: string;
  company_id: string;
  ledger_id: string;
  entry_index: number;
  is_debit: number;
  amount: number;
  narration: string;
  created_at: string;
}

export interface LedgerBankDetailsRecord {
  ledger_id: string;
  account_no: string;
  ifsc: string;
  swift: string;
  bank_name: string;
  branch: string;
}

export interface LedgerGstDetailsRecord {
  ledger_id: string;
  duty_head: 'CGST' | 'SGST' | 'IGST' | 'Cess' | 'Others';
  tax_rate: number;
  tax_type: string;
}

export interface LedgerTdsDetailsRecord {
  ledger_id: string;
  nature_of_payment: string;
  deductee_type: 'Company' | 'Individual/HUF' | 'Others';
  rate: number;
}

export interface BillRefRecord {
  id: string;
  company_id: string;
  party_ledger_id: string;
  ref_type: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
  ref_name: string;
  voucher_id: string | null;
  due_date: string | null;
  credit_period_days: number | null;
  opening_amount: number;
  is_debit: number;
  is_settled: number;
  created_at: string;
}

export interface VoucherBillAllocationRecord {
  id: string;
  voucher_id: string;
  voucher_ledger_entry_id: string;
  company_id: string;
  party_ledger_id: string;
  ref_type: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
  ref_name: string;
  amount: number;
  is_debit: number;
  due_date: string | null;
}

export interface CostCategoryRecord {
  id: string;
  company_id: string;
  name: string;
  allocate_revenue: number;
  allocate_non_revenue: number;
  created_at: string;
}

export interface CostCentreRecord {
  id: string;
  company_id: string;
  category_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export interface VoucherCostAllocationRecord {
  id: string;
  voucher_id: string;
  voucher_ledger_entry_id: string;
  company_id: string;
  cost_centre_id: string;
  amount: number;
}

export interface VoucherBankAllocationRecord {
  id: string;
  voucher_id: string;
  voucher_ledger_entry_id: string;
  company_id: string;
  bank_ledger_id: string;
  transaction_type: 'Cheque' | 'DD' | 'ECS' | 'NEFT' | 'RTGS' | 'UPI' | 'Others';
  instrument_no: string;
  instrument_date: string | null;
  bank_name: string;
  amount: number;
  cheque_status: 'Uncleared' | 'Cleared' | 'Bounced';
  bank_date: string | null;
  created_at: string;
}

export interface BudgetRecord {
  id: string;
  company_id: string;
  name: string;
  from_date: string;
  to_date: string;
  created_at: string;
}

export interface BudgetLineRecord {
  id: string;
  budget_id: string;
  ledger_id: string | null;
  group_id: string | null;
  cost_centre_id: string | null;
  amount: number;
}

export interface InterestRuleRecord {
  id: string;
  company_id: string;
  ledger_id: string;
  rate_percent: number;
  interest_style: '365-day Year' | '360-day Year' | 'Calendar Month' | 'Calendar Year';
  calculate_from: 'Voucher Date' | 'Due Date';
  grace_days: number;
}

export interface UnitRecord {
  id: string;
  company_id: string;
  symbol: string;
  formal_name: string;
  decimal_places: number;
  is_compound: number;
  base_unit_id: string | null;
  conversion_factor: number | null;
  created_at: string;
}

export interface StockGroupRecord {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface StockCategoryRecord {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface GodownRecord {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
  address: string;
  is_system: number;
  created_at: string;
}

export interface StockItemRecord {
  id: string;
  company_id: string;
  name: string;
  alias: string;
  part_no: string;
  group_id: string | null;
  category_id: string | null;
  unit_id: string;
  alternate_unit_id: string | null;
  alt_conversion_numerator: number | null;
  alt_conversion_denominator: number | null;
  costing_method: 'Avg Cost' | 'FIFO' | 'LIFO' | 'Last Purchase Cost' | 'Std Cost' | 'Zero Cost';
  market_valuation_method: string;
  opening_quantity: number;
  opening_rate: number;
  opening_value: number;
  opening_godown_id: string | null;
  maintain_batches: number;
  track_manufacturing_date: number;
  track_expiry_date: number;
  reorder_level: number | null;
  min_order_qty: number | null;
  hsn_sac: string;
  gst_taxability: 'Taxable' | 'Exempt' | 'Nil Rated' | 'Non-GST';
  gst_rate: number;
  cess_rate: number;
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BatchRecord {
  id: string;
  company_id: string;
  stock_item_id: string;
  name: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface StockItemBomRecord {
  id: string;
  company_id: string;
  stock_item_id: string;
  name: string;
  unit_id: string;
  produced_qty: number;
  components_json: string;
  by_products_json: string | null;
  created_at: string;
}

export interface VoucherInventoryEntryRecord {
  id: string;
  voucher_id: string;
  company_id: string;
  stock_item_id: string;
  godown_id: string | null;
  batch_id: string | null;
  entry_type: 'Inward' | 'Outward' | 'Transfer_Source' | 'Transfer_Dest';
  quantity: number;
  actual_quantity: number | null;
  rate: number;
  discount_percent: number;
  amount: number;
  tracking_number: string;
  order_number: string;
  entry_index: number;
  created_at: string;
}

export interface StockLedgerRecord {
  id: string;
  company_id: string;
  voucher_id: string | null;
  date: string;
  stock_item_id: string;
  godown_id: string | null;
  batch_id: string | null;
  inward_qty: number;
  outward_qty: number;
  rate: number;
  value: number;
  created_at: string;
}

export interface PriceListRecord {
  id: string;
  company_id: string;
  name: string;
  applicable_from: string;
  created_at: string;
}

export interface PriceListItemRecord {
  id: string;
  price_list_id: string;
  stock_item_id: string;
  from_qty: number;
  to_qty: number | null;
  rate: number;
  discount_percent: number;
}

export interface OrderHeaderRecord {
  id: string;
  company_id: string;
  order_type: 'Sales Order' | 'Purchase Order' | 'Job Work In' | 'Job Work Out';
  order_number: string;
  date: string;
  party_ledger_id: string;
  due_date: string | null;
  status: 'Pending' | 'Partial' | 'Completed' | 'Cancelled';
  total_amount: number;
  narration: string;
  created_at: string;
}

export interface OrderLineRecord {
  id: string;
  order_id: string;
  stock_item_id: string;
  quantity: number;
  fulfilled_quantity: number;
  rate: number;
  amount: number;
}

export interface VoucherGstSummaryRecord {
  id: string;
  voucher_id: string;
  company_id: string;
  place_of_supply: string;
  is_inter_state: number;
  is_rcm: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  hsn_summary_json: string;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  qr_code: string | null;
  eway_bill_no: string | null;
  eway_bill_date: string | null;
  created_at: string;
}

export interface VoucherTdsEntryRecord {
  id: string;
  voucher_id: string;
  company_id: string;
  party_ledger_id: string;
  tds_ledger_id: string;
  section: string;
  nature_of_payment: string;
  deductee_pan: string;
  gross_amount: number;
  rate: number;
  tds_amount: number;
  challan_no: string | null;
  bsr_code: string | null;
  deposit_date: string | null;
  created_at: string;
}

export interface FixedAssetRecord {
  id: string;
  company_id: string;
  name: string;
  asset_ledger_id: string;
  accumulated_depr_ledger_id: string | null;
  depr_expense_ledger_id: string | null;
  purchase_date: string;
  purchase_cost: number;
  wdv_block: string;
  it_act_rate: number;
  companies_act_method: 'SLM' | 'WDV';
  useful_life_years: number;
  salvage_value: number;
  created_at: string;
}

export interface DepreciationEntryRecord {
  id: string;
  company_id: string;
  fixed_asset_id: string;
  financial_year_id: string;
  date: string;
  it_depreciation: number;
  companies_act_depreciation: number;
  voucher_id: string | null;
  created_at: string;
}

export interface EmployeeGroupRecord {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface EmployeeRecord {
  id: string;
  company_id: string;
  name: string;
  emp_code: string;
  group_id: string | null;
  date_of_joining: string;
  date_of_leaving: string | null;
  designation: string;
  location: string;
  bank_name: string;
  bank_account_no: string;
  bank_ifsc: string;
  pan: string;
  aadhaar: string;
  uan: string;
  pf_no: string;
  esi_no: string;
  created_at: string;
}

export interface PayHeadRecord {
  id: string;
  company_id: string;
  name: string;
  pay_head_type:
    | 'Earnings for Employees'
    | 'Deductions from Employees'
    | 'Employees Statutory Deductions'
    | 'Employer Statutory Contributions'
    | 'Reimbursements'
    | 'Loans and Advances';
  income_type: 'Fixed' | 'Variable';
  ledger_id: string;
  calculation_type: 'Flat Rate' | 'On Attendance' | 'As Computed Value' | 'On Production';
  attendance_type: string | null;
  computation_formula: string | null;
  created_at: string;
}

export interface EmployeeSalaryStructureRecord {
  id: string;
  employee_id: string;
  pay_head_id: string;
  effective_from: string;
  amount: number;
}

export interface AttendanceRecord {
  id: string;
  company_id: string;
  date: string;
  employee_id: string;
  attendance_type: string;
  value: number;
}

export interface PayrollRunRecord {
  id: string;
  company_id: string;
  period_month: string;
  voucher_id: string | null;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  created_at: string;
}

export interface PayrollLineRecord {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  breakdown_json: string;
}

export interface TallyImportJobRecord {
  id: string;
  company_id: string;
  source_type: 'XML_FILE' | 'LIVE_SERVER' | 'EXCEL' | 'CSV' | 'NATIVE_BACKUP';
  file_path: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  total_records: number;
  imported_records: number;
  skipped_records: number;
  failed_records: number;
  reconciliation_report_json: string | null;
  error_message: string | null;
  created_at: string;
}

export interface TallyImportMapRecord {
  id: string;
  company_id: string;
  entity_type: string;
  tally_guid: string;
  tally_remote_id: string | null;
  tally_name: string | null;
  local_id: string;
  created_at: string;
}

export interface ReportConfigRecord {
  id: string;
  company_id: string;
  report_type: string;
  config_name: string;
  config_json: string;
  created_at: string;
}

export interface AppRegistryRecord {
  id: string;
  name: string;
  db_path: string;
  mailing_name: string;
  financial_year_begin: string;
  books_begin: string;
  last_opened_at: string | null;
  created_at: string;
}

export interface CreateCompanyInput {
  name: string;
  mailingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  state?: string;
  country?: string;
  pin?: string;
  phone?: string;
  email?: string;
  website?: string;
  financialYearBegin: string;
  booksBegin: string;
  baseCurrencySymbol?: string;
  baseCurrencyFormalName?: string;
  baseCurrencyDecimals?: number;
  companyPan?: string;
  gstin?: string;
  cin?: string;
}
