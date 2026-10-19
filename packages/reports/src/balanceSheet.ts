import { LedgerRepository, type Db } from '@ledgerdesk/db';
import { generateProfitAndLoss } from './profitAndLoss.js';

export interface BalanceSheetGroup {
  groupName: string;
  amount: number;
  ledgers: { ledgerId: string; name: string; amount: number }[];
}

export interface BalanceSheetReport {
  liabilities: BalanceSheetGroup[];
  totalLiabilities: number;

  assets: BalanceSheetGroup[];
  totalAssets: number;

  netProfit: number;
  netLoss: number;
  difference: number;
  isBalanced: boolean;
}

export function generateBalanceSheet(db: Db, companyId: string, asOfDate?: string): BalanceSheetReport {
  const ledgerRepo = new LedgerRepository(db);
  const ledgers = ledgerRepo.listWithBalances(companyId, asOfDate);
  const pnl = generateProfitAndLoss(db, companyId, asOfDate);

  const liabilitiesMap = new Map<string, BalanceSheetGroup>();
  const assetsMap = new Map<string, BalanceSheetGroup>();

  for (const l of ledgers) {
    if (l.closing_balance === 0) continue;
    if (l.group_nature === 'Income' || l.group_nature === 'Expense') {
      // Income and Expense ledgers are reflected through Net Profit/Loss in Reserves & Surplus / Capital
      continue;
    }

    const isAsset = l.group_nature === 'Assets';
    const targetMap = isAsset ? assetsMap : liabilitiesMap;

    let group = targetMap.get(l.group_name);
    if (!group) {
      group = { groupName: l.group_name, amount: 0, ledgers: [] };
      targetMap.set(l.group_name, group);
    }

    group.amount += l.closing_balance;
    group.ledgers.push({
      ledgerId: l.id,
      name: l.name,
      amount: l.closing_balance,
    });
  }

  // Reserves & Surplus / P&L
  const netProfit = pnl.netProfit;
  const netLoss = pnl.netLoss;

  let totalLiabilities = Array.from(liabilitiesMap.values()).reduce((acc, g) => acc + g.amount, 0);
  const totalAssets = Array.from(assetsMap.values()).reduce((acc, g) => acc + g.amount, 0);

  // Add net profit to liabilities (or deduct net loss)
  totalLiabilities += netProfit - netLoss;

  const liabilities = Array.from(liabilitiesMap.values());
  const assets = Array.from(assetsMap.values());

  const difference = totalAssets - totalLiabilities;
  const isBalanced = difference === 0;

  return {
    liabilities,
    totalLiabilities,
    assets,
    totalAssets,
    netProfit,
    netLoss,
    difference,
    isBalanced,
  };
}
