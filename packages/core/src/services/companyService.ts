import {
  closeDatabase,
  CompanyRegistry,
  CompanyRepository,
  integrityCheck,
  openDatabase,
  openRegistry,
  type AppRegistryRecord,
  type CompanyFeaturesRecord,
  type CompanyRecord,
  type Db,
  type GroupRecord,
} from '@ledgerdesk/db';
import { createCompanySchema, featuresPatchSchema, type CreateCompanyDto } from '../schemas/company.js';

export interface OpenCompanySession {
  registryId: string;
  dbPath: string;
  company: CompanyRecord;
  features: CompanyFeaturesRecord;
  groups: GroupRecord[];
  currentDate: string;
  periodBegin: string;
  periodEnd: string;
}

export class CompanyService {
  private registryDb: Db | null = null;
  private registry: CompanyRegistry | null = null;
  private openDb: Db | null = null;
  private openRegistryId: string | null = null;

  constructor(private readonly dataDir: string) {}

  private ensureRegistry(): CompanyRegistry {
    if (!this.registryDb || !this.registry) {
      this.registryDb = openRegistry(this.dataDir);
      this.registry = new CompanyRegistry(this.registryDb, this.dataDir);
    }
    return this.registry;
  }

  listCompanies(): AppRegistryRecord[] {
    return this.ensureRegistry().list();
  }

  createCompany(raw: CreateCompanyDto): { registryId: string; dbPath: string; companyId: string } {
    const input = createCompanySchema.parse(raw);
    if (input.booksBegin < input.financialYearBegin) {
      throw new Error('Books beginning date cannot be before financial year begin');
    }
    return this.ensureRegistry().create(input);
  }

  openCompany(registryId: string, currentDate?: string): OpenCompanySession {
    const reg = this.ensureRegistry();
    const entry = reg.get(registryId);
    if (!entry) throw new Error('Company not found in registry');

    this.closeOpenCompany();

    const db = openDatabase(entry.db_path, { fileMustExist: true });
    const check = integrityCheck(db);
    if (!check.ok) {
      closeDatabase(db);
      throw new Error(`Database integrity check failed: ${check.message}`);
    }

    const repo = new CompanyRepository(db);
    const company = repo.getCompany();
    if (!company) {
      closeDatabase(db);
      throw new Error('Company record missing in database');
    }
    const features = repo.getFeatures(company.id);
    if (!features) {
      closeDatabase(db);
      throw new Error('Company features missing');
    }

    reg.markOpened(registryId);
    this.openDb = db;
    this.openRegistryId = registryId;

    const date = currentDate ?? new Date().toISOString().slice(0, 10);
    const fy = db
      .prepare(
        `SELECT begin_date, end_date FROM financial_year WHERE company_id = ? AND is_current = 1`,
      )
      .get(company.id) as { begin_date: string; end_date: string };

    return {
      registryId,
      dbPath: entry.db_path,
      company,
      features,
      groups: repo.listGroups(company.id),
      currentDate: date,
      periodBegin: fy.begin_date,
      periodEnd: fy.end_date,
    };
  }

  getOpenDb(): Db {
    if (!this.openDb) throw new Error('No company is open');
    return this.openDb;
  }

  getOpenRegistryId(): string | null {
    return this.openRegistryId;
  }

  shutCompany(): void {
    this.closeOpenCompany();
  }

  deleteCompany(registryId: string, removeFile = true): void {
    if (this.openRegistryId === registryId) {
      this.closeOpenCompany();
    }
    this.ensureRegistry().delete(registryId, removeFile);
  }

  updateFeatures(patch: unknown): CompanyFeaturesRecord {
    const parsed = featuresPatchSchema.parse(patch);
    const db = this.getOpenDb();
    const repo = new CompanyRepository(db);
    const company = repo.getCompany();
    if (!company) throw new Error('No company open');
    repo.updateFeatures(company.id, parsed);
    const features = repo.getFeatures(company.id);
    if (!features) throw new Error('Features not found');
    return features;
  }

  getSessionSnapshot(currentDate?: string): OpenCompanySession | null {
    if (!this.openDb || !this.openRegistryId) return null;
    const repo = new CompanyRepository(this.openDb);
    const company = repo.getCompany();
    if (!company) return null;
    const features = repo.getFeatures(company.id);
    if (!features) return null;
    const fy = this.openDb
      .prepare(
        `SELECT begin_date, end_date FROM financial_year WHERE company_id = ? AND is_current = 1`,
      )
      .get(company.id) as { begin_date: string; end_date: string };
    return {
      registryId: this.openRegistryId,
      dbPath: '',
      company,
      features,
      groups: repo.listGroups(company.id),
      currentDate: currentDate ?? new Date().toISOString().slice(0, 10),
      periodBegin: fy.begin_date,
      periodEnd: fy.end_date,
    };
  }

  dispose(): void {
    this.closeOpenCompany();
    if (this.registryDb) {
      closeDatabase(this.registryDb);
      this.registryDb = null;
      this.registry = null;
    }
  }

  private closeOpenCompany(): void {
    if (this.openDb) {
      closeDatabase(this.openDb);
      this.openDb = null;
    }
    this.openRegistryId = null;
  }
}
