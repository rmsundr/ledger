import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccountingService,
  BillWiseService,
  CompanyService,
  InventoryService,
  PayrollService,
  StatutoryService,
} from '@ledgerdesk/core';
import {
  generateBalanceSheet,
  generateDayBook,
  generateLedgerStatement,
  generateProfitAndLoss,
  generateRatioAnalysis,
  generateStockSummary,
  generateTrialBalance,
} from '@ledgerdesk/reports';
import {
  DefaultTallyNativeReader,
  exportToTallyXml,
  importTallyData,
  parseTallyXml,
} from '@ledgerdesk/tally-import';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let companyService: CompanyService | null = null;
let voucherDate = new Date().toISOString().slice(0, 10);

function dataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

function getService(): CompanyService {
  if (!companyService) {
    companyService = new CompanyService(dataDir());
  }
  return companyService;
}

function getOpenCompanyId(): string {
  const session = getService().getSessionSnapshot(voucherDate);
  if (!session) throw new Error('No company is currently open');
  return session.company.id;
}

function resolvePreload(): string {
  for (const name of ['preload.mjs', 'preload.js', 'preload.cjs']) {
    const full = path.join(__dirname, name);
    if (fs.existsSync(full)) return full;
  }
  return path.join(__dirname, 'preload.mjs');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b1220',
    title: 'LedgerDesk',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const createCompanySchema = z.object({
  name: z.string(),
  mailingName: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  addressLine4: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  pin: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  financialYearBegin: z.string(),
  booksBegin: z.string(),
  baseCurrencySymbol: z.string().optional(),
  baseCurrencyFormalName: z.string().optional(),
  baseCurrencyDecimals: z.number().optional(),
  companyPan: z.string().optional(),
  gstin: z.string().optional(),
  cin: z.string().optional(),
});

function registerIpc(): void {
  // App & Shell
  ipcMain.handle('app:getInfo', () => ({
    name: 'LedgerDesk',
    version: app.getVersion(),
    dataDir: dataDir(),
    platform: process.platform,
  }));

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  // Company management
  ipcMain.handle('company:list', () => {
    return getService().listCompanies();
  });

  ipcMain.handle('company:create', (_e, payload: unknown) => {
    const input = createCompanySchema.parse(payload);
    return getService().createCompany(input);
  });

  ipcMain.handle('company:open', (_e, registryId: unknown) => {
    const id = z.string().uuid().parse(registryId);
    return getService().openCompany(id, voucherDate);
  });

  ipcMain.handle('company:shut', () => {
    getService().shutCompany();
    return { ok: true };
  });

  ipcMain.handle('company:delete', (_e, registryId: unknown) => {
    const id = z.string().uuid().parse(registryId);
    getService().deleteCompany(id, true);
    return { ok: true };
  });

  ipcMain.handle('company:session', () => {
    return getService().getSessionSnapshot(voucherDate);
  });

  ipcMain.handle('company:updateFeatures', (_e, patch: unknown) => {
    return getService().updateFeatures(patch);
  });

  ipcMain.handle('session:setDate', (_e, date: unknown) => {
    voucherDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
    return { currentDate: voucherDate };
  });

  ipcMain.handle('session:getDate', () => ({ currentDate: voucherDate }));

  // Accounting Masters & Vouchers
  ipcMain.handle('accounting:listLedgers', () => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listLedgersWithBalances(getOpenCompanyId());
  });

  ipcMain.handle('accounting:createLedger', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.createLedger(getOpenCompanyId(), payload as any);
  });

  ipcMain.handle('accounting:listVoucherTypes', () => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listVoucherTypes(getOpenCompanyId());
  });

  ipcMain.handle('accounting:getNextVoucherNumber', (_e, voucherTypeId: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    const vtId = z.string().parse(voucherTypeId);
    return { number: acct.getNextVoucherNumber(getOpenCompanyId(), vtId, voucherDate) };
  });

  ipcMain.handle('accounting:postVoucher', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.postVoucher(getOpenCompanyId(), payload as any);
  });

  ipcMain.handle('accounting:getVoucher', (_e, id: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.getVoucher(z.string().parse(id));
  });

  ipcMain.handle('accounting:listVouchers', (_e, filter: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listVouchers(getOpenCompanyId(), filter as any);
  });

  ipcMain.handle('accounting:cancelVoucher', (_e, id: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    acct.cancelVoucher(z.string().parse(id));
    return { ok: true };
  });

  // Reports
  ipcMain.handle('reports:trialBalance', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateTrialBalance(db, getOpenCompanyId(), date);
  });

  ipcMain.handle('reports:profitAndLoss', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateProfitAndLoss(db, getOpenCompanyId(), date);
  });

  ipcMain.handle('reports:balanceSheet', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateBalanceSheet(db, getOpenCompanyId(), date);
  });

  ipcMain.handle('reports:dayBook', (_e, filter?: unknown) => {
    const db = getService().getOpenDb();
    return generateDayBook(db, getOpenCompanyId(), filter as any);
  });

  ipcMain.handle('reports:ledgerStatement', (_e, ledgerId: unknown, filter?: unknown) => {
    const db = getService().getOpenDb();
    return generateLedgerStatement(db, getOpenCompanyId(), z.string().parse(ledgerId), filter as any);
  });

  ipcMain.handle('reports:stockSummary', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateStockSummary(db, getOpenCompanyId(), date);
  });

  ipcMain.handle('reports:ratioAnalysis', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateRatioAnalysis(db, getOpenCompanyId(), date);
  });

  // Inventory
  ipcMain.handle('inventory:listUnits', () => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.listUnits(getOpenCompanyId());
  });

  ipcMain.handle('inventory:createUnit', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.createUnit(getOpenCompanyId(), payload as any);
  });

  ipcMain.handle('inventory:listStockItems', () => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.listStockItems(getOpenCompanyId());
  });

  ipcMain.handle('inventory:createStockItem', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.createStockItem(getOpenCompanyId(), payload as any);
  });

  // Bill-wise & BRS
  ipcMain.handle('billwise:listReceivables', (_e, asOfDate: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listBillsReceivable(getOpenCompanyId(), z.string().parse(asOfDate));
  });

  ipcMain.handle('billwise:listPayables', (_e, asOfDate: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listBillsPayable(getOpenCompanyId(), z.string().parse(asOfDate));
  });

  ipcMain.handle('billwise:ageing', (_e, asOfDate: unknown, isReceivable: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.getAgeingAnalysis(getOpenCompanyId(), z.string().parse(asOfDate), Boolean(isReceivable));
  });

  ipcMain.handle('billwise:unreconciledBank', (_e, bankLedgerId: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listUnreconciledBankTransactions(getOpenCompanyId(), z.string().parse(bankLedgerId));
  });

  ipcMain.handle('billwise:setClearance', (_e, allocationId: unknown, date: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    bw.setBankClearanceDate(z.string().parse(allocationId), z.string().parse(date));
    return { ok: true };
  });

  // Statutory & Payroll
  ipcMain.handle('statutory:calcGst', (_e, params: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.calculateGst(params as any);
  });

  ipcMain.handle('statutory:gstr1', (_e, fromDate: unknown, toDate: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.getGstr1Report(getOpenCompanyId(), z.string().parse(fromDate), z.string().parse(toDate));
  });

  ipcMain.handle('payroll:listEmployees', () => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.listEmployees(getOpenCompanyId());
  });

  ipcMain.handle('payroll:createEmployee', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.createEmployee(getOpenCompanyId(), payload as any);
  });

  // Tally Import & Export
  ipcMain.handle('tally:importXml', (_e, xmlString: unknown) => {
    const db = getService().getOpenDb();
    const parsed = parseTallyXml(z.string().parse(xmlString));
    return importTallyData(db, getOpenCompanyId(), parsed);
  });

  ipcMain.handle('tally:exportXml', () => {
    const db = getService().getOpenDb();
    return exportToTallyXml(db, getOpenCompanyId());
  });

  ipcMain.handle('tally:detect', async (_e, targetPath: unknown) => {
    const reader = new DefaultTallyNativeReader();
    return reader.detect(z.string().parse(targetPath));
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  companyService?.dispose();
  companyService = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  companyService?.dispose();
  companyService = null;
});
