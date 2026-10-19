export interface TallyGroupImport {
  name: string;
  parentName?: string;
  nature?: 'Assets' | 'Liabilities' | 'Income' | 'Expense';
}

export interface TallyLedgerImport {
  name: string;
  parentGroup: string;
  openingBalance: number; // in minor units (paise)
  openingIsDebit: boolean;
  address?: string;
  state?: string;
  country?: string;
  pin?: string;
  pan?: string;
  gstin?: string;
  gstRegistrationType?: string;
  maintainBillByBill?: boolean;
}

export interface TallyVoucherEntryImport {
  ledgerName: string;
  isDebit: boolean;
  amount: number; // in minor units (paise)
  narration?: string;
  billAllocations?: {
    refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
    refName: string;
    amount: number;
    isDebit: boolean;
    dueDate?: string;
  }[];
}

export interface TallyVoucherImport {
  voucherType: string;
  voucherNumber: string;
  date: string; // YYYY-MM-DD
  referenceNo?: string;
  narration?: string;
  guid?: string;
  entries: TallyVoucherEntryImport[];
}

export interface TallyImportData {
  groups: TallyGroupImport[];
  ledgers: TallyLedgerImport[];
  vouchers: TallyVoucherImport[];
}

export interface TallyImportResult {
  groupsImported: number;
  ledgersImported: number;
  vouchersImported: number;
  vouchersSkipped: number;
  errors: string[];
  reconciliation: {
    totalClosingDebit: number;
    totalClosingCredit: number;
    difference: number;
    isBalanced: boolean;
  };
}
