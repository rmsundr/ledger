import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(120),
  mailingName: z.string().trim().max(120).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  addressLine3: z.string().max(200).optional(),
  addressLine4: z.string().max(200).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  pin: z.string().max(20).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  website: z.string().max(200).optional(),
  financialYearBegin: isoDate,
  booksBegin: isoDate,
  baseCurrencySymbol: z.string().max(8).optional(),
  baseCurrencyFormalName: z.string().max(80).optional(),
  baseCurrencyDecimals: z.number().int().min(0).max(4).optional(),
  companyPan: z.string().max(20).optional(),
  gstin: z.string().max(20).optional(),
  cin: z.string().max(30).optional(),
});

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;

export const featuresPatchSchema = z
  .object({
    maintain_accounts: z.number().int().min(0).max(1).optional(),
    maintain_inventory: z.number().int().min(0).max(1).optional(),
    integrate_accounts_inventory: z.number().int().min(0).max(1).optional(),
    multiple_currencies: z.number().int().min(0).max(1).optional(),
    bill_wise_details: z.number().int().min(0).max(1).optional(),
    cost_centres: z.number().int().min(0).max(1).optional(),
    interest_calculation: z.number().int().min(0).max(1).optional(),
    budgets_and_controls: z.number().int().min(0).max(1).optional(),
    payroll: z.number().int().min(0).max(1).optional(),
    gst: z.number().int().min(0).max(1).optional(),
    tds: z.number().int().min(0).max(1).optional(),
    tcs: z.number().int().min(0).max(1).optional(),
    vat_excise: z.number().int().min(0).max(1).optional(),
    post_dated_cheques: z.number().int().min(0).max(1).optional(),
    job_costing: z.number().int().min(0).max(1).optional(),
    debit_credit_notes: z.number().int().min(0).max(1).optional(),
    invoice_mode: z.number().int().min(0).max(1).optional(),
    optional_vouchers: z.number().int().min(0).max(1).optional(),
    memorandum_vouchers: z.number().int().min(0).max(1).optional(),
    reversing_journals: z.number().int().min(0).max(1).optional(),
    multiple_price_levels: z.number().int().min(0).max(1).optional(),
    batches: z.number().int().min(0).max(1).optional(),
    expiry_dates: z.number().int().min(0).max(1).optional(),
    manufacturing_bom: z.number().int().min(0).max(1).optional(),
    tracking_numbers: z.number().int().min(0).max(1).optional(),
    order_processing: z.number().int().min(0).max(1).optional(),
    purchase_sales_orders: z.number().int().min(0).max(1).optional(),
    additional_cost_details: z.number().int().min(0).max(1).optional(),
    actual_vs_billed_qty: z.number().int().min(0).max(1).optional(),
    rejection_in_out: z.number().int().min(0).max(1).optional(),
    zero_valued_transactions: z.number().int().min(0).max(1).optional(),
  })
  .strict();

export type FeaturesPatchDto = z.infer<typeof featuresPatchSchema>;
