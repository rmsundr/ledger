import type { GroupNature } from '../types.js';

export interface DefaultGroupDef {
  name: string;
  nature: GroupNature;
  parent?: string;
  usedForCalculation?: 'None' | 'Purchase' | 'Sales';
  sortOrder: number;
}

/** The 28 default Tally-style groups (15 primary + 13 sub-groups). */
export const DEFAULT_GROUPS: DefaultGroupDef[] = [
  { name: 'Branch / Divisions', nature: 'Liabilities', sortOrder: 1 },
  { name: 'Capital Account', nature: 'Liabilities', sortOrder: 2 },
  { name: 'Current Assets', nature: 'Assets', sortOrder: 3 },
  { name: 'Current Liabilities', nature: 'Liabilities', sortOrder: 4 },
  { name: 'Direct Expenses', nature: 'Expense', sortOrder: 5 },
  { name: 'Direct Incomes', nature: 'Income', sortOrder: 6 },
  { name: 'Fixed Assets', nature: 'Assets', sortOrder: 7 },
  { name: 'Indirect Expenses', nature: 'Expense', sortOrder: 8 },
  { name: 'Indirect Incomes', nature: 'Income', sortOrder: 9 },
  { name: 'Investments', nature: 'Assets', sortOrder: 10 },
  { name: 'Loans (Liability)', nature: 'Liabilities', sortOrder: 11 },
  { name: 'Misc. Expenses (Asset)', nature: 'Assets', sortOrder: 12 },
  {
    name: 'Purchase Accounts',
    nature: 'Expense',
    usedForCalculation: 'Purchase',
    sortOrder: 13,
  },
  {
    name: 'Sales Accounts',
    nature: 'Income',
    usedForCalculation: 'Sales',
    sortOrder: 14,
  },
  { name: 'Suspense A/c', nature: 'Assets', sortOrder: 15 },

  { name: 'Bank Accounts', nature: 'Assets', parent: 'Current Assets', sortOrder: 101 },
  { name: 'Bank OD A/c', nature: 'Liabilities', parent: 'Loans (Liability)', sortOrder: 102 },
  { name: 'Cash-in-Hand', nature: 'Assets', parent: 'Current Assets', sortOrder: 103 },
  { name: 'Deposits (Asset)', nature: 'Assets', parent: 'Current Assets', sortOrder: 104 },
  {
    name: 'Duties & Taxes',
    nature: 'Liabilities',
    parent: 'Current Liabilities',
    sortOrder: 105,
  },
  {
    name: 'Loans & Advances (Asset)',
    nature: 'Assets',
    parent: 'Current Assets',
    sortOrder: 106,
  },
  { name: 'Provisions', nature: 'Liabilities', parent: 'Current Liabilities', sortOrder: 107 },
  {
    name: 'Reserves & Surplus',
    nature: 'Liabilities',
    parent: 'Capital Account',
    sortOrder: 108,
  },
  {
    name: 'Retained Earnings',
    nature: 'Liabilities',
    parent: 'Capital Account',
    sortOrder: 109,
  },
  { name: 'Secured Loans', nature: 'Liabilities', parent: 'Loans (Liability)', sortOrder: 110 },
  { name: 'Stock-in-Hand', nature: 'Assets', parent: 'Current Assets', sortOrder: 111 },
  {
    name: 'Sundry Creditors',
    nature: 'Liabilities',
    parent: 'Current Liabilities',
    sortOrder: 112,
  },
  { name: 'Sundry Debtors', nature: 'Assets', parent: 'Current Assets', sortOrder: 113 },
  {
    name: 'Unsecured Loans',
    nature: 'Liabilities',
    parent: 'Loans (Liability)',
    sortOrder: 114,
  },
];
