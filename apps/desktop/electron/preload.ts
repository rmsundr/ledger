import { contextBridge, ipcRenderer } from 'electron';

export type LedgerDeskApi = {
  // App & Company
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    dataDir: string;
    platform: string;
  }>;
  listCompanies: () => Promise<unknown[]>;
  createCompany: (payload: unknown) => Promise<unknown>;
  openCompany: (registryId: string) => Promise<unknown>;
  shutCompany: () => Promise<{ ok: boolean }>;
  deleteCompany: (registryId: string) => Promise<{ ok: boolean }>;
  getSession: () => Promise<unknown>;
  updateFeatures: (patch: unknown) => Promise<unknown>;
  setDate: (date: string) => Promise<{ currentDate: string }>;
  getDate: () => Promise<{ currentDate: string }>;
  quit: () => Promise<void>;

  // Accounting Masters & Vouchers
  listLedgers: () => Promise<unknown[]>;
  createLedger: (payload: unknown) => Promise<unknown>;
  listVoucherTypes: () => Promise<unknown[]>;
  getNextVoucherNumber: (voucherTypeId: string) => Promise<{ number: string }>;
  postVoucher: (payload: unknown) => Promise<unknown>;
  getVoucher: (id: string) => Promise<unknown>;
  listVouchers: (filter?: unknown) => Promise<unknown[]>;
  cancelVoucher: (id: string) => Promise<{ ok: boolean }>;

  // Reports
  getTrialBalance: (asOfDate?: string) => Promise<unknown>;
  getProfitAndLoss: (asOfDate?: string) => Promise<unknown>;
  getBalanceSheet: (asOfDate?: string) => Promise<unknown>;
  getDayBook: (filter?: unknown) => Promise<unknown>;
  getLedgerStatement: (ledgerId: string, filter?: unknown) => Promise<unknown>;
  getStockSummary: (asOfDate?: string) => Promise<unknown>;
  getRatioAnalysis: (asOfDate?: string) => Promise<unknown>;

  // Inventory
  listUnits: () => Promise<unknown[]>;
  createUnit: (payload: unknown) => Promise<unknown>;
  listStockItems: () => Promise<unknown[]>;
  createStockItem: (payload: unknown) => Promise<unknown>;

  // Bill-wise, Ageing, BRS
  listBillsReceivable: (asOfDate: string) => Promise<unknown[]>;
  listBillsPayable: (asOfDate: string) => Promise<unknown[]>;
  getAgeingAnalysis: (asOfDate: string, isReceivable: boolean) => Promise<unknown[]>;
  listUnreconciledBank: (bankLedgerId: string) => Promise<unknown[]>;
  setBankClearance: (allocationId: string, date: string) => Promise<{ ok: boolean }>;

  // Statutory & Payroll
  calculateGst: (params: unknown) => Promise<unknown>;
  getGstr1: (fromDate: string, toDate: string) => Promise<unknown>;
  getGstr3b: (taxPeriod: string) => Promise<unknown>;
  buildEInvoice: (voucherId: string) => Promise<unknown>;
  buildEwayBill: (voucherId: string) => Promise<unknown>;
  listEmployees: () => Promise<unknown[]>;
  createEmployee: (payload: unknown) => Promise<unknown>;

  // Tally Import & Export
  importTallyXml: (xmlString: string) => Promise<unknown>;
  importTallyXmlFile: (filePath: string) => Promise<unknown>;
  pickTallyXmlFile: (defaultPath?: string) => Promise<string | null>;
  exportTallyXml: () => Promise<string>;
  detectTallyPath: (targetPath: string) => Promise<unknown>;

  // Tally XML server (the route to data held in Tally's native format)
  tallyServerListCompanies: (config?: unknown) => Promise<unknown>;
  tallyServerPing: (config?: unknown) => Promise<unknown>;
  tallyServerImportMasters: (payload: unknown) => Promise<unknown>;
  tallyServerImportDayBook: (payload: unknown) => Promise<unknown>;

  // Backup & Restore
  createBackup: (note?: string) => Promise<unknown>;
  listBackups: () => Promise<unknown[]>;
  restoreBackup: (backupPath: string) => Promise<{ ok: boolean }>;

  // Audit
  auditLog: (action: string, entityType: string, entityId: string, details?: unknown) => Promise<{ ok: boolean }>;
  verifyAuditChain: () => Promise<unknown>;

  // Interest
  listInterestRules: () => Promise<unknown[]>;
  saveInterestRule: (input: unknown) => Promise<unknown>;
  deleteInterestRule: (ledgerId: string) => Promise<{ ok: boolean }>;
  computeInterest: (asOfDate: string, interestLedgerId: string, incomeLedgerId: string) => Promise<unknown>;

  // Payroll
  runPayroll: (periodMonth: string) => Promise<unknown>;
  getPayrollRun: (periodMonth: string) => Promise<unknown>;
  listPayrollRuns: () => Promise<unknown[]>;
  buildBankTransferCsv: (periodMonth: string) => Promise<string>;
};

const api: LedgerDeskApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  listCompanies: () => ipcRenderer.invoke('company:list'),
  createCompany: (payload) => ipcRenderer.invoke('company:create', payload),
  openCompany: (registryId) => ipcRenderer.invoke('company:open', registryId),
  shutCompany: () => ipcRenderer.invoke('company:shut'),
  deleteCompany: (registryId) => ipcRenderer.invoke('company:delete', registryId),
  getSession: () => ipcRenderer.invoke('company:session'),
  updateFeatures: (patch) => ipcRenderer.invoke('company:updateFeatures', patch),
  setDate: (date) => ipcRenderer.invoke('session:setDate', date),
  getDate: () => ipcRenderer.invoke('session:getDate'),
  quit: () => ipcRenderer.invoke('app:quit'),

  listLedgers: () => ipcRenderer.invoke('accounting:listLedgers'),
  createLedger: (payload) => ipcRenderer.invoke('accounting:createLedger', payload),
  listVoucherTypes: () => ipcRenderer.invoke('accounting:listVoucherTypes'),
  getNextVoucherNumber: (voucherTypeId) => ipcRenderer.invoke('accounting:getNextVoucherNumber', voucherTypeId),
  postVoucher: (payload) => ipcRenderer.invoke('accounting:postVoucher', payload),
  getVoucher: (id) => ipcRenderer.invoke('accounting:getVoucher', id),
  listVouchers: (filter) => ipcRenderer.invoke('accounting:listVouchers', filter),
  cancelVoucher: (id) => ipcRenderer.invoke('accounting:cancelVoucher', id),

  getTrialBalance: (asOfDate) => ipcRenderer.invoke('reports:trialBalance', asOfDate),
  getProfitAndLoss: (asOfDate) => ipcRenderer.invoke('reports:profitAndLoss', asOfDate),
  getBalanceSheet: (asOfDate) => ipcRenderer.invoke('reports:balanceSheet', asOfDate),
  getDayBook: (filter) => ipcRenderer.invoke('reports:dayBook', filter),
  getLedgerStatement: (ledgerId, filter) => ipcRenderer.invoke('reports:ledgerStatement', ledgerId, filter),
  getStockSummary: (asOfDate) => ipcRenderer.invoke('reports:stockSummary', asOfDate),
  getRatioAnalysis: (asOfDate) => ipcRenderer.invoke('reports:ratioAnalysis', asOfDate),

  listUnits: () => ipcRenderer.invoke('inventory:listUnits'),
  createUnit: (payload) => ipcRenderer.invoke('inventory:createUnit', payload),
  listStockItems: () => ipcRenderer.invoke('inventory:listStockItems'),
  createStockItem: (payload) => ipcRenderer.invoke('inventory:createStockItem', payload),

  listBillsReceivable: (asOfDate) => ipcRenderer.invoke('billwise:listReceivables', asOfDate),
  listBillsPayable: (asOfDate) => ipcRenderer.invoke('billwise:listPayables', asOfDate),
  getAgeingAnalysis: (asOfDate, isReceivable) => ipcRenderer.invoke('billwise:ageing', asOfDate, isReceivable),
  listUnreconciledBank: (bankLedgerId) => ipcRenderer.invoke('billwise:unreconciledBank', bankLedgerId),
  setBankClearance: (allocationId, date) => ipcRenderer.invoke('billwise:setClearance', allocationId, date),

  calculateGst: (params) => ipcRenderer.invoke('statutory:calcGst', params),
  getGstr1: (fromDate, toDate) => ipcRenderer.invoke('statutory:gstr1', fromDate, toDate),
  getGstr3b: (taxPeriod) => ipcRenderer.invoke('statutory:gstr3b', taxPeriod),
  buildEInvoice: (voucherId) => ipcRenderer.invoke('statutory:buildEInvoice', voucherId),
  buildEwayBill: (voucherId) => ipcRenderer.invoke('statutory:buildEwayBill', voucherId),
  listEmployees: () => ipcRenderer.invoke('payroll:listEmployees'),
  createEmployee: (payload) => ipcRenderer.invoke('payroll:createEmployee', payload),

  importTallyXml: (xmlString) => ipcRenderer.invoke('tally:importXml', xmlString),
  importTallyXmlFile: (filePath) => ipcRenderer.invoke('tally:importXmlFile', filePath),
  pickTallyXmlFile: (defaultPath) => ipcRenderer.invoke('tally:pickXmlFile', defaultPath),
  exportTallyXml: () => ipcRenderer.invoke('tally:exportXml'),
  detectTallyPath: (targetPath) => ipcRenderer.invoke('tally:detect', targetPath),

  tallyServerListCompanies: (config) => ipcRenderer.invoke('tally:serverListCompanies', config),
  tallyServerPing: (config) => ipcRenderer.invoke('tally:serverPing', config),
  tallyServerImportMasters: (payload) => ipcRenderer.invoke('tally:serverImportMasters', payload),
  tallyServerImportDayBook: (payload) => ipcRenderer.invoke('tally:serverImportDayBook', payload),

  createBackup: (note) => ipcRenderer.invoke('backup:create', note),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (backupPath) => ipcRenderer.invoke('backup:restore', backupPath),

  auditLog: (action, entityType, entityId, details) => ipcRenderer.invoke('audit:log', action, entityType, entityId, details),
  verifyAuditChain: () => ipcRenderer.invoke('audit:verify'),

  listInterestRules: () => ipcRenderer.invoke('interest:listRules'),
  saveInterestRule: (input) => ipcRenderer.invoke('interest:saveRule', input),
  deleteInterestRule: (ledgerId) => ipcRenderer.invoke('interest:deleteRule', ledgerId),
  computeInterest: (asOfDate, interestLedgerId, incomeLedgerId) => ipcRenderer.invoke('interest:compute', asOfDate, interestLedgerId, incomeLedgerId),

  runPayroll: (periodMonth) => ipcRenderer.invoke('payroll:runPayroll', periodMonth),
  getPayrollRun: (periodMonth) => ipcRenderer.invoke('payroll:getPayrollRun', periodMonth),
  listPayrollRuns: () => ipcRenderer.invoke('payroll:listPayrollRuns'),
  buildBankTransferCsv: (periodMonth) => ipcRenderer.invoke('payroll:buildBankTransferCsv', periodMonth),
};

contextBridge.exposeInMainWorld('ledgerdesk', api);
