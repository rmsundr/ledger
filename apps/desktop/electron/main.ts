import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccountingService,
  AuditService,
  BackupService,
  BillWiseService,
  CompanyService,
  InventoryService,
  InterestService,
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
  buildCompanyListRequest,
  buildDayBookExportRequest,
  buildMastersExportRequest,
  exportToTallyXml,
  fetchFromTallyServer,
  fetchTallyData,
  importTallyData,
  parseCompanyList,
  parseTallyXml,
  parseTallyXmlFile,
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

function reinitializeServices(): void {
  // Services are created per IPC handler from getService().getOpenDb()
}

function clearServices(): void {
  // No-op
}

/** Normalise the host/port/timeout sent by the Tally server UI. */
function serverConfig(raw: unknown): { host: string; port: number; timeoutMs: number } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const port = Number(obj.port);
  const timeoutMs = Number(obj.timeoutMs);
  return {
    host: typeof obj.host === 'string' && obj.host.trim() ? obj.host.trim() : '127.0.0.1',
    port: Number.isFinite(port) && port > 0 ? port : 9000,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000,
  };
}

/** Read the company/date/config fields of a Tally server import request. */
function serverImportPayload(raw: unknown): {
  companyName: string;
  fromDate: string;
  toDate: string;
  config: unknown;
} {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
  return {
    companyName: str(obj.companyName),
    fromDate: str(obj.fromDate, '2023-04-01'),
    toDate: str(obj.toDate, '2024-03-31'),
    config: obj.config,
  };
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

/**
 * Register an IPC handler, replacing any existing handler for the same
 * channel.
 *
 * Electron's `ipcMain.handle` throws when a channel is registered twice, and
 * that throw inside `registerIpc()` aborts startup before the window is
 * created — leaving the app running with no UI and no visible error. Routing
 * every registration through this wrapper makes a duplicate channel a
 * deliberate override instead of a crash.
 */
function handle(channel: string, listener: (...args: any[]) => unknown): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

function registerIpc(): void {
  // App & Shell
  handle('app:getInfo', () => ({
    name: 'LedgerDesk',
    version: app.getVersion(),
    dataDir: dataDir(),
    platform: process.platform,
  }));

  handle('app:quit', () => {
    app.quit();
  });

  // Company management
  handle('company:list', () => {
    return getService().listCompanies();
  });

  handle('company:create', (_e, payload: unknown) => {
    const input = createCompanySchema.parse(payload);
    return getService().createCompany(input);
  });

  handle('company:open', (_e, registryId: unknown) => {
    const id = z.string().uuid().parse(registryId);
    const result = getService().openCompany(id, voucherDate);
    reinitializeServices();
    return result;
  });

  handle('company:shut', () => {
    clearServices();
    getService().shutCompany();
    return { ok: true };
  });

  handle('company:delete', (_e, registryId: unknown) => {
    const id = z.string().uuid().parse(registryId);
    getService().deleteCompany(id, true);
    return { ok: true };
  });

  handle('company:session', () => {
    return getService().getSessionSnapshot(voucherDate);
  });

  handle('company:updateFeatures', (_e, patch: unknown) => {
    return getService().updateFeatures(patch);
  });

  handle('session:setDate', (_e, date: unknown) => {
    voucherDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
    return { currentDate: voucherDate };
  });

  handle('session:getDate', () => ({ currentDate: voucherDate }));

  // Accounting Masters & Vouchers
  handle('accounting:listLedgers', () => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listLedgersWithBalances(getOpenCompanyId());
  });

  handle('accounting:createLedger', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.createLedger(getOpenCompanyId(), payload as any);
  });

  handle('accounting:listVoucherTypes', () => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listVoucherTypes(getOpenCompanyId());
  });

  handle('accounting:getNextVoucherNumber', (_e, voucherTypeId: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    const vtId = z.string().parse(voucherTypeId);
    return { number: acct.getNextVoucherNumber(getOpenCompanyId(), vtId, voucherDate) };
  });

  handle('accounting:postVoucher', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.postVoucher(getOpenCompanyId(), payload as any);
  });

  handle('accounting:getVoucher', (_e, id: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.getVoucher(z.string().parse(id));
  });

  handle('accounting:listVouchers', (_e, filter: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    return acct.listVouchers(getOpenCompanyId(), filter as any);
  });

  handle('accounting:cancelVoucher', (_e, id: unknown) => {
    const db = getService().getOpenDb();
    const acct = new AccountingService(db);
    acct.cancelVoucher(z.string().parse(id));
    return { ok: true };
  });

  // Reports
  handle('reports:trialBalance', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateTrialBalance(db, getOpenCompanyId(), date);
  });

  handle('reports:profitAndLoss', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateProfitAndLoss(db, getOpenCompanyId(), date);
  });

  handle('reports:balanceSheet', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateBalanceSheet(db, getOpenCompanyId(), date);
  });

  handle('reports:dayBook', (_e, filter?: unknown) => {
    const db = getService().getOpenDb();
    return generateDayBook(db, getOpenCompanyId(), filter as any);
  });

  handle('reports:ledgerStatement', (_e, ledgerId: unknown, filter?: unknown) => {
    const db = getService().getOpenDb();
    return generateLedgerStatement(db, getOpenCompanyId(), z.string().parse(ledgerId), filter as any);
  });

  handle('reports:stockSummary', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateStockSummary(db, getOpenCompanyId(), date);
  });

  handle('reports:ratioAnalysis', (_e, asOfDate?: unknown) => {
    const db = getService().getOpenDb();
    const date = typeof asOfDate === 'string' ? asOfDate : undefined;
    return generateRatioAnalysis(db, getOpenCompanyId(), date);
  });

  // Inventory
  handle('inventory:listUnits', () => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.listUnits(getOpenCompanyId());
  });

  handle('inventory:createUnit', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.createUnit(getOpenCompanyId(), payload as any);
  });

  handle('inventory:listStockItems', () => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.listStockItems(getOpenCompanyId());
  });

  handle('inventory:createStockItem', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const inv = new InventoryService(db);
    return inv.createStockItem(getOpenCompanyId(), payload as any);
  });

  // Bill-wise & BRS
  handle('billwise:listReceivables', (_e, asOfDate: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listBillsReceivable(getOpenCompanyId(), z.string().parse(asOfDate));
  });

  handle('billwise:listPayables', (_e, asOfDate: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listBillsPayable(getOpenCompanyId(), z.string().parse(asOfDate));
  });

  handle('billwise:ageing', (_e, asOfDate: unknown, isReceivable: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.getAgeingAnalysis(getOpenCompanyId(), z.string().parse(asOfDate), Boolean(isReceivable));
  });

  handle('billwise:unreconciledBank', (_e, bankLedgerId: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    return bw.listUnreconciledBankTransactions(getOpenCompanyId(), z.string().parse(bankLedgerId));
  });

  handle('billwise:setClearance', (_e, allocationId: unknown, date: unknown) => {
    const db = getService().getOpenDb();
    const bw = new BillWiseService(db);
    bw.setBankClearanceDate(z.string().parse(allocationId), z.string().parse(date));
    return { ok: true };
  });

  // Statutory & Payroll
  handle('statutory:calcGst', (_e, params: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.calculateGst(params as any);
  });

  handle('statutory:gstr1', (_e, fromDate: unknown, toDate: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.getGstr1Report(getOpenCompanyId(), z.string().parse(fromDate), z.string().parse(toDate));
  });

  handle('statutory:gstr3b', (_e, taxPeriod: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.getGstr3bSummary(getOpenCompanyId(), z.string().parse(taxPeriod));
  });

  handle('statutory:buildEInvoice', (_e, voucherId: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.buildEInvoicePayload(getOpenCompanyId(), z.string().parse(voucherId));
  });

  handle('statutory:buildEwayBill', (_e, voucherId: unknown) => {
    const db = getService().getOpenDb();
    const stat = new StatutoryService(db);
    return stat.buildEwayBillPayload(getOpenCompanyId(), z.string().parse(voucherId));
  });

  handle('payroll:listEmployees', () => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.listEmployees(getOpenCompanyId());
  });

  handle('payroll:createEmployee', (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.createEmployee(getOpenCompanyId(), payload as any);
  });

  // Tally Import & Export
  handle('tally:importXml', (_e, xmlString: unknown) => {
    const db = getService().getOpenDb();
    const parsed = parseTallyXml(z.string().parse(xmlString));
    return importTallyData(db, getOpenCompanyId(), parsed);
  });

  // Import a Tally XML file straight from disk. DayBook exports routinely
  // run to hundreds of megabytes, so the file is streamed through the parser
  // rather than read into memory and pasted into a text box.
  handle('tally:importXmlFile', (_e, filePath: unknown) => {
    const db = getService().getOpenDb();
    const parsed = parseTallyXmlFile(z.string().parse(filePath));
    return importTallyData(db, getOpenCompanyId(), parsed);
  });

  // Show an open dialog so the user can pick a Tally XML export without
  // having to type the path.
  handle('tally:pickXmlFile', async (_e, defaultPath?: unknown) => {
    const result = await dialog.showOpenDialog({
      title: 'Select Tally XML Export',
      properties: ['openFile'],
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      filters: [
        { name: 'Tally XML', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  handle('tally:exportXml', () => {
    const db = getService().getOpenDb();
    return exportToTallyXml(db, getOpenCompanyId());
  });

  handle('tally:detect', async (_e, targetPath: unknown) => {
    const reader = new DefaultTallyNativeReader();
    return reader.detect(z.string().parse(targetPath));
  });

  // --- Tally XML server -------------------------------------------------
  // The only route to data that lives in Tally's proprietary native format
  // (.001/.002 files): Tally itself serves the data as XML on port 9000.

  handle('tally:serverListCompanies', async (_e, cfg?: unknown) => {
    const res = await fetchFromTallyServer(buildCompanyListRequest(), serverConfig(cfg));
    if (!res.ok) return { ok: false, error: res.error, companies: [] };
    return { ok: true, companies: parseCompanyList(res.data ?? '') };
  });

  handle('tally:serverPing', async (_e, cfg?: unknown) => {
    const res = await fetchFromTallyServer(buildCompanyListRequest(), serverConfig(cfg));
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true };
  });

  handle('tally:serverImportMasters', async (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const { companyName, config } = serverImportPayload(payload);
    const request = buildMastersExportRequest(companyName);
    const data = await fetchTallyData(request, serverConfig(config));
    return importTallyData(db, getOpenCompanyId(), data);
  });

  handle('tally:serverImportDayBook', async (_e, payload: unknown) => {
    const db = getService().getOpenDb();
    const { companyName, fromDate, toDate, config } = serverImportPayload(payload);
    const request = buildDayBookExportRequest(companyName, fromDate, toDate);
    const data = await fetchTallyData(request, serverConfig(config));
    return importTallyData(db, getOpenCompanyId(), data);
  });

  // Backup & Restore
  handle('backup:create', (_e, note?: unknown) => {
    const db = getService().getOpenDb();
    const backup = new BackupService(getService().getOpenDbPath(), path.join(dataDir(), 'backups'), db);
    return backup.createBackup(typeof note === 'string' ? note : 'Manual backup');
  });

  handle('backup:list', () => {
    const db = getService().getOpenDb();
    const backup = new BackupService(getService().getOpenDbPath(), path.join(dataDir(), 'backups'), db);
    return backup.listBackups();
  });

  handle('backup:restore', (_e, backupPath: unknown) => {
    const db = getService().getOpenDb();
    const backup = new BackupService(getService().getOpenDbPath(), path.join(dataDir(), 'backups'), db);
    backup.restoreBackup(z.string().parse(backupPath));
    return { ok: true };
  });

  // Audit Log
  handle('audit:log', (_e, action: unknown, entityType: unknown, entityId: unknown, details: unknown) => {
    const db = getService().getOpenDb();
    const audit = new AuditService(db, getOpenCompanyId());
    audit.logAction(undefined, z.string().parse(action), z.string().parse(entityType), z.string().parse(entityId), details);
    return { ok: true };
  });

  handle('audit:verify', () => {
    const db = getService().getOpenDb();
    const audit = new AuditService(db, getOpenCompanyId());
    return audit.verifyChain();
  });

  // Interest Rules
  handle('interest:listRules', () => {
    const db = getService().getOpenDb();
    const interest = new InterestService(db);
    return interest.listRules(getOpenCompanyId());
  });

  handle('interest:saveRule', (_e, input: unknown) => {
    const db = getService().getOpenDb();
    const interest = new InterestService(db);
    return interest.saveRule({
      companyId: getOpenCompanyId(),
      ...(input as any),
    });
  });

  handle('interest:deleteRule', (_e, ledgerId: unknown) => {
    const db = getService().getOpenDb();
    const interest = new InterestService(db);
    interest.deleteRule(getOpenCompanyId(), z.string().parse(ledgerId));
    return { ok: true };
  });

  handle('interest:compute', (_e, asOfDate: unknown, interestLedgerId: unknown, incomeLedgerId: unknown) => {
    const db = getService().getOpenDb();
    const interest = new InterestService(db);
    return interest.compute(getOpenCompanyId(), z.string().parse(asOfDate), {
      interestLedgerId: z.string().parse(interestLedgerId),
      incomeLedgerId: z.string().parse(incomeLedgerId),
    });
  });

  // Payroll
  handle('payroll:runPayroll', (_e, periodMonth: unknown) => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.runPayroll(getOpenCompanyId(), z.string().parse(periodMonth));
  });

  handle('payroll:getPayrollRun', (_e, periodMonth: unknown) => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.getPayrollRun(getOpenCompanyId(), z.string().parse(periodMonth));
  });

  handle('payroll:listPayrollRuns', () => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.listPayrollRuns(getOpenCompanyId());
  });

  handle('payroll:buildBankTransferCsv', (_e, periodMonth: unknown) => {
    const db = getService().getOpenDb();
    const pay = new PayrollService(db);
    return pay.buildBankTransferCsv(getOpenCompanyId(), z.string().parse(periodMonth));
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A duplicate IPC channel registration throws inside registerIpc(). If that
// throw escaped, the window would never be created and the app would sit
// running with no UI and no visible error. Fail loudly and visibly instead.
process.on('unhandledRejection', (reason) => {
  console.error('[ledgerdesk] unhandled rejection during startup:', reason);
  dialog.showErrorBox(
    'LedgerDesk failed to start',
    reason instanceof Error ? reason.stack ?? reason.message : String(reason),
  );
  app.exit(1);
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
