/**
 * Interest service.
 *
 * Ties the pure interest engine to the database: reads the per-ledger interest
 * rules, collects the open bills of each ledger's party, and returns the
 * accrual lines plus the journal voucher that books them.
 */

import { BillCostBankRepository, type Db, type InterestRuleRecord } from '@ledgerdesk/db';
import {
  computeBillInterest,
  computeInterest,
  type InterestBasis,
  type InterestBill,
  type InterestLine,
  type InterestResult,
  type InterestStyle,
} from './interestEngine.js';

export interface InterestJournalLine {
  ledgerId: string;
  ledgerName: string;
  isDebit: boolean;
  amount: number;
}

export interface InterestRunResult {
  asOfDate: string;
  lines: InterestLine[];
  totalInterest: number;
  journalLines: InterestJournalLine[];
}

function toRule(record: InterestRuleRecord) {
  return {
    ratePercent: record.rate_percent,
    interestStyle: record.interest_style as InterestStyle,
    calculateFrom: record.calculate_from as InterestBasis,
    graceDays: record.grace_days,
    compound: false,
    isReceivable: record.is_receivable !== 0,
  };
}

export class InterestService {
  private repo: BillCostBankRepository;

  constructor(private readonly db: Db) {
    this.repo = new BillCostBankRepository(db);
  }

  listRules(companyId: string): InterestRuleRecord[] {
    return this.repo.listInterestRules(companyId);
  }

  getRule(companyId: string, ledgerId: string): InterestRuleRecord | undefined {
    return this.repo.getInterestRule(companyId, ledgerId);
  }

  saveRule(input: {
    companyId: string;
    ledgerId: string;
    ratePercent: number;
    interestStyle: InterestStyle;
    calculateFrom: InterestBasis;
    graceDays: number;
    isReceivable?: boolean;
  }): InterestRuleRecord {
    if (input.ratePercent < 0) {
      throw new Error('Interest rate cannot be negative');
    }
    if (input.graceDays < 0) {
      throw new Error('Grace days cannot be negative');
    }
    return this.repo.upsertInterestRule(input);
  }

  deleteRule(companyId: string, ledgerId: string): void {
    this.repo.deleteInterestRule(companyId, ledgerId);
  }

  /**
   * Compute interest on a single bill using a ledger's rule.
   */
  computeForBill(
    companyId: string,
    ledgerId: string,
    bill: InterestBill,
    asOfDate: string,
  ): InterestLine {
    const record = this.repo.getInterestRule(companyId, ledgerId);
    if (!record) {
      throw new Error(`No interest rule configured for ledger ${ledgerId}`);
    }
    return computeBillInterest(bill, toRule(record), asOfDate);
  }

  /**
   * Compute interest across every ledger that has an interest rule, using the
   * open (unsettled) bills of the parties involved.
   *
   * A rule is attached to a ledger; that ledger is the party whose bills
   * accrue interest. Bills belonging to parties without a rule are skipped.
   */
  compute(
    companyId: string,
    asOfDate: string,
    options: { interestLedgerId: string; incomeLedgerId: string },
  ): InterestRunResult {
    const rules = this.repo.listInterestRules(companyId);
    if (rules.length === 0) {
      return { asOfDate, lines: [], totalInterest: 0, journalLines: [] };
    }

    const ruleMap = new Map<string, ReturnType<typeof toRule>>();
    for (const record of rules) {
      ruleMap.set(record.ledger_id, toRule(record));
    }

    // Collect the open bills of every party that has a rule.
    //
    // `listBillsOutstanding` is used rather than the raw allocations because
    // it already nets off the settled part of each bill — interest must accrue
    // on the pending amount, not on the original amount.
    const bills: InterestBill[] = [];
    for (const isReceivable of [true, false]) {
      const outstanding = this.repo.listBillsOutstanding(companyId, asOfDate, isReceivable);
      for (const item of outstanding) {
        const rule = ruleMap.get(item.party_ledger_id);
        if (!rule) continue;
        // The rule's sense must match the sense of the bill it is applied to.
        if ((rule.isReceivable ?? true) !== isReceivable) continue;
        bills.push({
          refName: item.ref_name,
          partyLedgerId: item.party_ledger_id,
          amount: item.pending_amount,
          date: item.bill_date,
          dueDate: item.due_date,
        });
      }
    }

    const result: InterestResult = computeInterest(bills, ruleMap, asOfDate, {
      interestLedgerId: options.interestLedgerId,
      incomeLedgerId: options.incomeLedgerId,
    });

    const names = new Map<string, string>();
    const nameRows = this.db
      .prepare(`SELECT id, name FROM ledger WHERE company_id = ?`)
      .all(companyId) as { id: string; name: string }[];
    for (const row of nameRows) names.set(row.id, row.name);

    const journalLines: InterestJournalLine[] = result.journalLines.map((j) => ({
      ledgerId: j.ledgerId,
      ledgerName: names.get(j.ledgerId) ?? j.ledgerId,
      isDebit: j.isDebit,
      amount: j.amount,
    }));

    return {
      asOfDate,
      lines: result.lines,
      totalInterest: result.totalInterest,
      journalLines,
    };
  }
}
