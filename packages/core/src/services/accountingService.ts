import {
  LedgerRepository,
  VoucherRepository,
  type Db,
  type FullVoucher,
  type LedgerRecord,
  type LedgerWithBalance,
  type VoucherRecord,
  type VoucherTypeRecord,
} from '@ledgerdesk/db';
import {
  createLedgerSchema,
  createVoucherSchema,
  type CreateLedgerInputDto,
  type CreateVoucherInputDto,
} from '../schemas/voucher.js';

export class AccountingService {
  private ledgerRepo: LedgerRepository;
  private voucherRepo: VoucherRepository;

  constructor(private readonly db: Db) {
    this.ledgerRepo = new LedgerRepository(db);
    this.voucherRepo = new VoucherRepository(db);
  }

  listLedgers(companyId: string) {
    return this.ledgerRepo.list(companyId);
  }

  listLedgersWithBalances(companyId: string, asOfDate?: string): LedgerWithBalance[] {
    return this.ledgerRepo.listWithBalances(companyId, asOfDate);
  }

  createLedger(companyId: string, raw: CreateLedgerInputDto): LedgerRecord {
    const input = createLedgerSchema.parse(raw);
    const existing = this.ledgerRepo.getByName(companyId, input.name);
    if (existing) {
      throw new Error(`Ledger with name "${input.name}" already exists`);
    }
    return this.ledgerRepo.create({
      ...input,
      companyId,
    });
  }

  updateLedger(id: string, patch: Partial<CreateLedgerInputDto>): LedgerRecord {
    return this.ledgerRepo.update(id, patch);
  }

  deleteLedger(id: string): boolean {
    return this.ledgerRepo.delete(id);
  }

  listVoucherTypes(companyId: string): VoucherTypeRecord[] {
    return this.db
      .prepare(`SELECT * FROM voucher_type WHERE company_id = ? AND deleted_at IS NULL ORDER BY name`)
      .all(companyId) as VoucherTypeRecord[];
  }

  getNextVoucherNumber(companyId: string, voucherTypeId: string, date: string): string {
    return this.voucherRepo.getNextVoucherNumber(companyId, voucherTypeId, date);
  }

  postVoucher(companyId: string, raw: CreateVoucherInputDto): FullVoucher {
    const input = createVoucherSchema.parse(raw);
    return this.voucherRepo.createVoucher({
      ...input,
      companyId,
    });
  }

  getVoucher(id: string): FullVoucher | undefined {
    return this.voucherRepo.getById(id);
  }

  listVouchers(
    companyId: string,
    filter?: { fromDate?: string; toDate?: string; voucherTypeId?: string },
  ): (VoucherRecord & { party_ledger?: string })[] {
    return this.voucherRepo.list(companyId, filter);
  }

  cancelVoucher(id: string): void {
    this.voucherRepo.cancelVoucher(id);
  }

  deleteVoucher(id: string): void {
    this.voucherRepo.deleteVoucher(id);
  }
}
