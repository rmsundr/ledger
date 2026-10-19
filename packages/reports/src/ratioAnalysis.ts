import type { Db } from '@ledgerdesk/db';
import { generateBalanceSheet } from './balanceSheet.js';
import { generateProfitAndLoss } from './profitAndLoss.js';

export interface RatioAnalysisReport {
  currentRatio: number;
  quickRatio: number;
  debtEquityRatio: number;
  grossProfitMarginPercent: number;
  netProfitMarginPercent: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalSales: number;
  grossProfit: number;
  netProfit: number;
}

export function generateRatioAnalysis(db: Db, companyId: string, asOfDate?: string): RatioAnalysisReport {
  const bs = generateBalanceSheet(db, companyId, asOfDate);
  const pnl = generateProfitAndLoss(db, companyId, asOfDate);

  const currentAssetGroups = ['Current Assets', 'Bank Accounts', 'Cash-in-Hand', 'Sundry Debtors', 'Stock-in-Hand'];
  const currentLiabGroups = ['Current Liabilities', 'Duties & Taxes', 'Sundry Creditors', 'Provisions'];

  let totalCurrentAssets = 0;
  let totalInventory = 0;
  for (const g of bs.assets) {
    if (currentAssetGroups.includes(g.groupName)) {
      totalCurrentAssets += g.amount;
      if (g.groupName === 'Stock-in-Hand') {
        totalInventory += g.amount;
      }
    }
  }

  let totalCurrentLiabilities = 0;
  for (const g of bs.liabilities) {
    if (currentLiabGroups.includes(g.groupName)) {
      totalCurrentLiabilities += g.amount;
    }
  }

  let totalDebt = 0;
  let totalEquity = 0;
  for (const g of bs.liabilities) {
    if (g.groupName.includes('Loan')) {
      totalDebt += g.amount;
    }
    if (g.groupName === 'Capital Account' || g.groupName === 'Reserves & Surplus') {
      totalEquity += g.amount;
    }
  }
  totalEquity += bs.netProfit - bs.netLoss;

  const currentRatio = totalCurrentLiabilities > 0 ? Number((totalCurrentAssets / totalCurrentLiabilities).toFixed(2)) : 0;
  const quickRatio =
    totalCurrentLiabilities > 0
      ? Number(((totalCurrentAssets - totalInventory) / totalCurrentLiabilities).toFixed(2))
      : 0;
  const debtEquityRatio = totalEquity > 0 ? Number((totalDebt / totalEquity).toFixed(2)) : 0;

  const totalSales = pnl.totalDirectIncome;
  const grossProfitMarginPercent =
    totalSales > 0 ? Number(((pnl.grossProfit / totalSales) * 100).toFixed(2)) : 0;
  const netProfitMarginPercent =
    totalSales > 0 ? Number(((pnl.netProfit / totalSales) * 100).toFixed(2)) : 0;

  return {
    currentRatio,
    quickRatio,
    debtEquityRatio,
    grossProfitMarginPercent,
    netProfitMarginPercent,
    totalCurrentAssets,
    totalCurrentLiabilities,
    totalSales,
    grossProfit: pnl.grossProfit,
    netProfit: pnl.netProfit,
  };
}
