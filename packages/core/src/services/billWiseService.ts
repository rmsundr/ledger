import {
  BillCostBankRepository,
  type BillOutstandingItem,
  type CostCategoryRecord,
  type CostCentreRecord,
  type Db,
} from '@ledgerdesk/db';

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
}
