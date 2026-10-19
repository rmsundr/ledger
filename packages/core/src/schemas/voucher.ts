import { z } from 'zod';

export const createLedgerSchema = z.object({
  name: z.string().min(1, 'Ledger name is required'),
  alias: z.string().optional(),
  groupId: z.string().min(1, 'Parent group is required'),
  openingBalance: z.number().int().nonnegative().optional().default(0), // in minor units
  openingIsDebit: z.boolean().optional().default(true),
  maintainBillByBill: z.boolean().optional().default(false),
  defaultCreditPeriodDays: z.number().int().positive().optional(),
  inventoryValuesAffected: z.boolean().optional().default(false),
  costCentresApplicable: z.boolean().optional().default(false),
  mailingName: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  pin: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  pan: z.string().optional(),
  gstRegistrationType: z.string().optional(),
  gstin: z.string().optional(),
});

export type CreateLedgerDto = z.infer<typeof createLedgerSchema>;
export type CreateLedgerInputDto = z.input<typeof createLedgerSchema>;

export const voucherLedgerEntrySchema = z.object({
  ledgerId: z.string().min(1, 'Ledger is required'),
  isDebit: z.boolean(),
  amount: z.number().int().positive('Amount must be positive integer minor units'),
  narration: z.string().optional(),
});

export const voucherBillAllocationSchema = z.object({
  entryIndex: z.number().int().nonnegative(),
  partyLedgerId: z.string(),
  refType: z.enum(['New Ref', 'Agst Ref', 'Advance', 'On Account']),
  refName: z.string().min(1),
  amount: z.number().int().positive(),
  isDebit: z.boolean(),
  dueDate: z.string().optional(),
});

export const voucherCostAllocationSchema = z.object({
  entryIndex: z.number().int().nonnegative(),
  costCentreId: z.string(),
  amount: z.number().int().positive(),
});

export const voucherBankAllocationSchema = z.object({
  entryIndex: z.number().int().nonnegative(),
  bankLedgerId: z.string(),
  transactionType: z.enum(['Cheque', 'DD', 'ECS', 'NEFT', 'RTGS', 'UPI', 'Others']),
  instrumentNo: z.string().optional(),
  instrumentDate: z.string().optional(),
  bankName: z.string().optional(),
  amount: z.number().int().positive(),
  chequeStatus: z.enum(['Uncleared', 'Cleared', 'Bounced']).optional(),
  bankDate: z.string().optional(),
});

export const voucherInventoryEntrySchema = z.object({
  stockItemId: z.string(),
  godownId: z.string().optional(),
  batchId: z.string().optional(),
  entryType: z.enum(['Inward', 'Outward', 'Transfer_Source', 'Transfer_Dest']),
  quantity: z.number().positive(),
  actualQuantity: z.number().positive().optional(),
  rate: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional().default(0),
  amount: z.number().int().nonnegative(),
  trackingNumber: z.string().optional(),
  orderNumber: z.string().optional(),
});

export const voucherGstSummarySchema = z.object({
  placeOfSupply: z.string().optional(),
  isInterState: z.boolean().optional(),
  isRcm: z.boolean().optional(),
  taxableValue: z.number().int().nonnegative().optional(),
  cgstAmount: z.number().int().nonnegative().optional(),
  sgstAmount: z.number().int().nonnegative().optional(),
  igstAmount: z.number().int().nonnegative().optional(),
  cessAmount: z.number().int().nonnegative().optional(),
  hsnSummaryJson: z.string().optional(),
});

export const createVoucherSchema = z.object({
  voucherTypeId: z.string(),
  voucherTypeName: z.string(),
  voucherNumber: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  effectiveDate: z.string().optional(),
  referenceNo: z.string().optional(),
  referenceDate: z.string().optional(),
  narration: z.string().optional(),
  isInvoice: z.boolean().optional(),
  isOptional: z.boolean().optional(),
  isPostDated: z.boolean().optional(),
  ledgerEntries: z.array(voucherLedgerEntrySchema).min(1, 'At least one ledger entry is required'),
  billAllocations: z.array(voucherBillAllocationSchema).optional(),
  costAllocations: z.array(voucherCostAllocationSchema).optional(),
  bankAllocations: z.array(voucherBankAllocationSchema).optional(),
  inventoryEntries: z.array(voucherInventoryEntrySchema).optional(),
  gstSummary: voucherGstSummarySchema.optional(),
});

export type CreateVoucherDto = z.infer<typeof createVoucherSchema>;
export type CreateVoucherInputDto = z.input<typeof createVoucherSchema>;
