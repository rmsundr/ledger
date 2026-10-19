import { LedgerRepository, type Db } from '@ledgerdesk/db';

export interface PnLLine {
  ledgerId: string;
  name: string;
  groupName: string;
  amount: number; // minor units
}

export interface ProfitAndLossReport {
  // Trading account
  salesAccounts: PnLLine[];
  directIncomes: PnLLine[];
  totalDirectIncome: number;

  purchaseAccounts: PnLLine[];
  directExpenses: PnLLine[];
  totalDirectExpense: number;

  grossProfit: number;
  grossLoss: number;

  // Profit and Loss account
  indirectIncomes: PnLLine[];
  totalIndirectIncome: number;

  indirectExpenses: PnLLine[];
  totalIndirectExpense: number;

  netProfit: number;
  netLoss: number;
}

export function generateProfitAndLoss(db: Db, companyId: string, asOfDate?: string): ProfitAndLossReport {
  const ledgerRepo = new LedgerRepository(db);
  const ledgers = ledgerRepo.listWithBalances(companyId, asOfDate);

  const salesAccounts: PnLLine[] = [];
  const directIncomes: PnLLine[] = [];
  const purchaseAccounts: PnLLine[] = [];
  const directExpenses: PnLLine[] = [];
  const indirectIncomes: PnLLine[] = [];
  const indirectExpenses: PnLLine[] = [];

  for (const l of ledgers) {
    if (l.closing_balance === 0) continue;

    // Income groups usually have credit closing balances
    // Expense groups usually have debit closing balances
    const line: PnLLine = {
      ledgerId: l.id,
      name: l.name,
      groupName: l.group_name,
      amount: l.closing_balance,
    };

    if (l.group_name === 'Sales Accounts') {
      salesAccounts.push(line);
    } else if (l.group_name === 'Direct Incomes') {
      directIncomes.push(line);
    } else if (l.group_name === 'Purchase Accounts') {
      purchaseAccounts.push(line);
    } else if (l.group_name === 'Direct Expenses') {
      directExpenses.push(line);
    } else if (l.group_nature === 'Income' || l.group_name === 'Indirect Incomes') {
      indirectIncomes.push(line);
    } else if (l.group_nature === 'Expense' || l.group_name === 'Indirect Expenses') {
      indirectExpenses.push(line);
    }
  }

  const sumLines = (lines: PnLLine[]) => lines.reduce((acc, x) => acc + x.amount, 0);

  const totalDirectIncome = sumLines(salesAccounts) + sumLines(directIncomes);
  const totalDirectExpense = sumLines(purchaseAccounts) + sumLines(directExpenses);

  const grossDifference = totalDirectIncome - totalDirectExpense;
  const grossProfit = grossDifference > 0 ? grossDifference : 0;
  const grossLoss = grossDifference < 0 ? Math.abs(grossDifference) : 0;

  const totalIndirectIncome = sumLines(indirectIncomes);
  const totalIndirectExpense = sumLines(indirectExpenses);

  const netDifference = grossProfit - grossLoss + totalIndirectIncome - totalIndirectExpense;
  const netProfit = netDifference > 0 ? netDifference : 0;
  const netLoss = netDifference < 0 ? Math.abs(netDifference) : 0;

  return {
    salesAccounts,
    directIncomes,
    totalDirectIncome,
    purchaseAccounts,
    directExpenses,
    totalDirectExpense,
    grossProfit,
    grossLoss,
    indirectIncomes,
    totalIndirectIncome,
    indirectExpenses,
    totalIndirectExpense,
    netProfit,
    netLoss,
  };
}
