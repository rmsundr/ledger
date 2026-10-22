export interface TallyGroupImport {
  name: string;
  parentName?: string;
  nature?: 'Assets' | 'Liabilities' | 'Income' | 'Expense';
}

export interface TallyCostCategoryImport {
  name: string;
  allocateRevenue?: boolean;
  allocateNonRevenue?: boolean;
}

export interface TallyCostCentreImport {
  name: string;
  categoryName: string;
  parentName?: string;
}

export interface TallyUnitImport {
  symbol: string;
  formalName: string;
  decimalPlaces: number;
  isCompound?: boolean;
  baseUnitSymbol?: string;
  conversionFactor?: number;
}

export interface TallyStockGroupImport {
  name: string;
  parentName?: string;
}

export interface TallyStockCategoryImport {
  name: string;
  parentName?: string;
}

export interface TallyGodownImport {
  name: string;
  parentName?: string;
}

export interface TallyStockItemImport {
  name: string;
  alias?: string;
  partNo?: string;
  groupName?: string;
  categoryName?: string;
  unitSymbol: string;
  alternateUnitSymbol?: string;
  altConversionNumerator?: number;
  altConversionDenominator?: number;
  costingMethod?: 'Avg Cost' | 'FIFO' | 'LIFO' | 'Last Purchase Cost' | 'Std Cost' | 'Zero Cost';
  openingQuantity?: number;
  openingRate?: number; // minor units
  openingValue?: number; // minor units
  openingGodownName?: string;
  maintainBatches?: boolean;
  trackManufacturingDate?: boolean;
  trackExpiryDate?: boolean;
  reorderLevel?: number;
  minOrderQty?: number;
  hsnSac?: string;
  gstTaxability?: 'Taxable' | 'Exempt' | 'Nil Rated' | 'Non-GST';
  gstRate?: number;
  cessRate?: number;
  description?: string;
}

export interface TallyBatchImport {
  stockItemName: string;
  name: string;
  godownName?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  openingQuantity?: number;
  openingRate?: number; // minor units
  openingValue?: number; // minor units
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
  costCentresAllocated?: string[];
}

export interface TallyVoucherEntryImport {
  ledgerName: string;
  isDebit: boolean;
  amount: number; // in minor units (paise)
  /**
   * Raw signal from the Tally XML: the AMOUNT was negative.
   * Tally's own export convention (used by TallyPrime / GST vouchers) is
   * "negative amount = Debit", which is more reliable than
   * ISDEEMEDPOSITIVE. Kept so the importer can resolve the convention per
   * voucher instead of assuming one for the whole file.
   */
  isNegativeAmount?: boolean;
  /** Raw ISDEEMEDPOSITIVE flag from the Tally XML ("Yes" = Debit). */
  isDeemedPositive?: boolean;
  narration?: string;
  billAllocations?: {
    refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account';
    refName: string;
    amount: number;
    isDebit: boolean;
    dueDate?: string;
  }[];
  costAllocations?: {
    costCentreName: string;
    costCategoryName?: string;
    amount: number;
  }[];
  inventoryEntries?: {
    stockItemName: string;
    quantity: number; // in base units (can be decimal)
    rate: number; // minor units per unit
    amount: number; // minor units
    godownName?: string;
    batchName?: string;
    manufacturingDate?: string;
    expiryDate?: string;
    trackingNumber?: string;
    orderNumber?: string;
    entryType: 'Inward' | 'Outward' | 'Transfer_Source' | 'Transfer_Dest';
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
  costCategories: TallyCostCategoryImport[];
  costCentres: TallyCostCentreImport[];
  units: TallyUnitImport[];
  stockGroups: TallyStockGroupImport[];
  stockCategories: TallyStockCategoryImport[];
  godowns: TallyGodownImport[];
  stockItems: TallyStockItemImport[];
  batches: TallyBatchImport[];
}

export interface TallyImportResult {
  groupsImported: number;
  ledgersImported: number;
  vouchersImported: number;
  vouchersSkipped: number;
  costCategoriesImported: number;
  costCentresImported: number;
  unitsImported: number;
  stockGroupsImported: number;
  stockCategoriesImported: number;
  godownsImported: number;
  stockItemsImported: number;
  batchesImported: number;
  errors: string[];
  reconciliation: {
    totalClosingDebit: number;
    totalClosingCredit: number;
    difference: number;
    isBalanced: boolean;
  };
}
