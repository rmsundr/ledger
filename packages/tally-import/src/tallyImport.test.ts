import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, CompanyRegistry, migrate } from '@ledgerdesk/db';
import {
  DefaultTallyNativeReader,
  exportToTallyXml,
  importTallyData,
  parseTallyXml,
} from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SAMPLE_TALLY_XML = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GROUP NAME="North Distributors">
            <NAME>North Distributors</NAME>
            <PARENT>Sundry Debtors</PARENT>
          </GROUP>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Metro Traders">
            <NAME>Metro Traders</NAME>
            <PARENT>Sundry Debtors</PARENT>
            <OPENINGBALANCE>-25000.00</OPENINGBALANCE>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <LEDSTATENAME>Delhi</LEDSTATENAME>
            <PARTYGSTIN>07AAAAA0000A1Z5</PARTYGSTIN>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Wholesale Sales">
            <NAME>Wholesale Sales</NAME>
            <PARENT>Sales Accounts</PARENT>
            <OPENINGBALANCE>25000.00</OPENINGBALANCE>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>20250412</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>RCT-001</VOUCHERNUMBER>
            <NARRATION>Payment received against opening dues</NARRATION>
            <GUID>GUID-123456-ABCDEF</GUID>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cash</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Metro Traders</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>10000.00</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>OB-001</NAME>
                <BILLTYPE>Agst Ref</BILLTYPE>
                <AMOUNT>10000.00</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`.trim();

describe('Tally Import & Export Engine', () => {
  it('parses Tally XML and resolves Dr/Cr conventions', () => {
    const parsed = parseTallyXml(SAMPLE_TALLY_XML);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].name).toBe('North Distributors');

    expect(parsed.ledgers).toHaveLength(2);
    const metro = parsed.ledgers.find((l) => l.name === 'Metro Traders')!;
    expect(metro.openingBalance).toBe(2500000); // ₹25,000 in paise
    expect(metro.openingIsDebit).toBe(true); // negative amount = Debit
    expect(metro.gstin).toBe('07AAAAA0000A1Z5');

    expect(parsed.vouchers).toHaveLength(1);
    const voucher = parsed.vouchers[0];
    expect(voucher.voucherType).toBe('Receipt');
    expect(voucher.date).toBe('2025-04-12');
    expect(voucher.entries).toHaveLength(2);
    expect(voucher.entries[0].ledgerName).toBe('Cash');
    expect(voucher.entries[0].isDebit).toBe(true);
    expect(voucher.entries[0].amount).toBe(1000000);
    expect(voucher.entries[1].ledgerName).toBe('Metro Traders');
    expect(voucher.entries[1].isDebit).toBe(false);
    expect(voucher.entries[1].amount).toBe(1000000);
  });

  it('imports Tally XML into SQLite, enforces idempotency, and reconciles Trial Balance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-tally-test-'));
    tempDirs.push(dir);
    const regDb = openDatabase(path.join(dir, 'registry.db'));
    migrate(regDb);
    const reg = new CompanyRegistry(regDb, dir);
    const created = reg.create({
      name: 'Tally Import Demo',
      financialYearBegin: '2025-04-01',
      booksBegin: '2025-04-01',
    });
    const db = openDatabase(created.dbPath);

    const parsed = parseTallyXml(SAMPLE_TALLY_XML);
    const result = importTallyData(db, created.companyId, parsed);

    expect(result.groupsImported).toBe(1);
    expect(result.ledgersImported).toBe(2);
    expect(result.vouchersImported).toBe(1);
    expect(result.vouchersSkipped).toBe(0);
    expect(result.reconciliation.isBalanced).toBe(true);
    expect(result.reconciliation.difference).toBe(0);

    // Re-importing same data should be idempotent (vouchers skipped)
    const result2 = importTallyData(db, created.companyId, parsed);
    expect(result2.vouchersImported).toBe(0);
    expect(result2.vouchersSkipped).toBe(1);

    // Test Roundtrip Exporter
    const exportedXml = exportToTallyXml(db, created.companyId);
    expect(exportedXml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(exportedXml).toContain('Metro Traders');
    expect(exportedXml).toContain('Wholesale Sales');
    expect(exportedXml).toContain('RCT-001');

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('detects proprietary backup files and provides clear instructions', async () => {
    const reader = new DefaultTallyNativeReader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-detect-test-'));
    tempDirs.push(dir);

    const dummy900 = path.join(dir, 'TBK900.001.900');
    fs.writeFileSync(dummy900, 'mock');

    const detection = await reader.detect(dummy900);
    expect(detection.kind).toBe('TALLY_BACKUP_FILE');
    expect(detection.guidance).toContain('Gateway of Tally -> Export -> Masters/Vouchers -> XML format');
  });
});
