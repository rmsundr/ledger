import {
  BillCostBankRepository,
  type BillOutstandingItem,
  type CostCategoryRecord,
  type CostCentreRecord,
  type Db,
} from '@ledgerdesk/db';
import {
  previewAllocation,
  settleBills,
  type RefType,
  type SettlementResult,
} from './billSettlement.js';

export interface AgeingAnalysisBucket {
  party_name: string;
  total_pending: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
}

export class BillWiseService {
  private repo: BillCostBankRepository;

  constructor(db: Db) {
    this.repo = new BillCostBankRepository(db);
  }

  // Cost Centres
  listCostCategories(companyId: string): CostCategoryRecord[] {
    return this.repo.listCostCategories(companyId);
  }

  createCostCategory(companyId: string, name: string): CostCategoryRecord {
    return this.repo.createCostCategory({ companyId, name });
  }

  listCostCentres(companyId: string): (CostCentreRecord & { category_name: string })[] {
    return this.repo.listCostCentres(companyId);
  }

  createCostCentre(companyId: string, categoryId: string, name: string, parentId?: string): CostCentreRecord {
    return this.repo.createCostCentre({ companyId, categoryId, name, parentId });
  }

  // Bills Outstanding
  listBillsReceivable(companyId: string, asOfDate: string): BillOutstandingItem[] {
    return this.repo.listBillsOutstanding(companyId, asOfDate, true);
  }

  listBillsPayable(companyId: string, asOfDate: string): BillOutstandingItem[] {
    return this.repo.listBillsOutstanding(companyId, asOfDate, false);
  }

  getAgeingAnalysis(companyId: string, asOfDate: string, isReceivable: boolean): AgeingAnalysisBucket[] {
    const items = this.repo.listBillsOutstanding(companyId, asOfDate, isReceivable);
    const map = new Map<string, AgeingAnalysisBucket>();

    for (const item of items) {
      let bucket = map.get(item.party_name);
      if (!bucket) {
        bucket = {
          party_name: item.party_name,
          total_pending: 0,
          bucket_0_30: 0,
          bucket_31_60: 0,
          bucket_61_90: 0,
          bucket_over_90: 0,
        };
        map.set(item.party_name, bucket);
      }

      bucket.total_pending += item.pending_amount;

      if (item.overdue_days <= 30) {
        bucket.bucket_0_30 += item.pending_amount;
      } else if (item.overdue_days <= 60) {
        bucket.bucket_31_60 += item.pending_amount;
      } else if (item.overdue_days <= 90) {
        bucket.bucket_61_90 += item.pending_amount;
      } else {
        bucket.bucket_over_90 += item.pending_amount;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total_pending - a.total_pending);
  }

  // Bank Reconciliation
  listUnreconciledBankTransactions(companyId: string, bankLedgerId: string) {
    return this.repo.listUnreconciledBankTransactions(companyId, bankLedgerId);
  }

  setBankClearanceDate(allocationId: string, clearanceDate: string): void {
    this.repo.setBankClearanceDate(allocationId, clearanceDate);
  }

  /**
   * Compute the settlement position for a party: which bills are still open,
   * how much is pending on each, and how much of a payment could not be
   * matched to any open bill.
   */
  getPartySettlement(companyId: string, partyLedgerId: string, asOfDate?: string): SettlementResult {
    const allocations = this.repo.getPartyAllocations(companyId, partyLedgerId, asOfDate);
    return settleBills(
      allocations.map((a) => ({
        id: a.id,
        voucherId: a.voucher_id,
        date: a.date,
        refType: a.ref_type as RefType,
        refName: a.ref_name,
        amount: a.amount,
        isDebit: a.is_debit,
        dueDate: a.due_date,
      })),
    );
  }

  /**
   * Preview how a payment of `amount` would be allocated across a party's
   * open bills, oldest due date first.
   */
  previewPaymentAllocation(
    companyId: string,
    partyLedgerId: string,
    amount: number,
    asOfDate?: string,
  ): { refName: string; amount: number }[] {
    const settlement = this.getPartySettlement(companyId, partyLedgerId, asOfDate);
    return previewAllocation(
      settlement.openBills.map((b) => ({
        refName: b.refName,
        pending: b.pending,
        dueDate: b.dueDate,
        date: b.date,
      })),
      amount,
    );
  }

  /**
   * List every party with bill allocations and their open balance.
   */
  listPartiesWithBills(companyId: string) {
    return this.repo.listPartiesWithBills(companyId);
  }
}
