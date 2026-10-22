import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, CompanyRegistry, migrate } from '@ledgerdesk/db';
import { importTallyData, parseTallyXml, parseTallyXmlFile } from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A voucher shaped like a real TallyPrime "Sales GST" entry: the amount
 * carries a sign, the inventory entries live at voucher level, and each
 * inventory entry carries its own accounting allocation naming the sales
 * ledger.
 */
const DAYBOOK_SALES_GST = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales GST" ACTION="Create">
            <DATE>20230402</DATE>
            <VOUCHERTYPENAME>Sales GST</VOUCHERTYPENAME>
            <VOUCHERNUMBER>KRL001/23-24</VOUCHERNUMBER>
            <PARTYNAME>AAKASH SUPERMARKET - S KOLATHUR</PARTYNAME>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>AAKASH SUPERMARKET - S KOLATHUR</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-614.00</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>KRL001/23-24</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>-614.00</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>14.63</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>14.63</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Round Off</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>-0.44</AMOUNT>
            </LEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>PONKATHIR PUTTU PODI 500GM</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>42.67/Nos</RATE>
              <AMOUNT>256.02</AMOUNT>
              <ACTUALQTY> 6 Nos</ACTUALQTY>
              <BILLEDQTY> 6 Nos</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Main Location</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>256.02</AMOUNT>
                <ACTUALQTY> 6 Nos</ACTUALQTY>
              </BATCHALLOCATIONS.LIST>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>GST Sales</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>256.02</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>PONKATHIR CHEMBA PUTTUPODI500GM</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>54.86/Nos</RATE>
              <AMOUNT>329.16</AMOUNT>
              <ACTUALQTY> 6 Nos</ACTUALQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Main Location</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>329.16</AMOUNT>
              </BATCHALLOCATIONS.LIST>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>GST Sales</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>329.16</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`.trim();

/**
 * The same company a year later, with the *same* voucher number — Tally
 * restarts numbering each financial year.
 */
const DAYBOOK_SALES_GST_NEXT_YEAR = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales GST" ACTION="Create">
            <DATE>20240402</DATE>
            <VOUCHERTYPENAME>Sales GST</VOUCHERTYPENAME>
            <VOUCHERNUMBER>KRL001/23-24</VOUCHERNUMBER>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>AAKASH SUPERMARKET - S KOLATHUR</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-500.00</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Cash</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>500.00</AMOUNT>
            </LEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`.trim();

/**
 * A voucher whose inventory items are written straight into the ledger
 * entry, with no ALLINVENTORYENTRIES.LIST wrapper.
 */
const DAYBOOK_INLINE_INVENTORY = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
            <DATE>20240501</DATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>12</VOUCHERNUMBER>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SANTHOSH SUPER MARKET - ANNA NAGAR</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>1167.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>GST Sales</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-1111.60</AMOUNT>
              <STOCKITEMNAME>PONKATHIR CHEMBA PUTTUPODI500GM</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>60.64/Nos</RATE>
              <AMOUNT>-424.48</AMOUNT>
              <ACTUALQTY> 7 Nos</ACTUALQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Main Location</GODOWNNAME>
                <AMOUNT>-424.48</AMOUNT>
              </BATCHALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-27.79</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-27.79</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Round Off</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>0.18</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`.trim();

describe('Tally DayBook import', () => {
  it('reads the Dr/Cr direction from the amount sign, not from ISDEEMEDPOSITIVE', () => {
    const parsed = parseTallyXml(DAYBOOK_SALES_GST);

    expect(parsed.vouchers).toHaveLength(1);
    const voucher = parsed.vouchers[0];

    // The party is Debit (negative amount) even though the sales leg is a
    // Credit — only the sign of the amount can tell these apart.
    const party = voucher.entries.find((e) => e.ledgerName.includes('AAKASH'))!;
    expect(party.isDebit).toBe(true);
    expect(party.amount).toBe(61400);

    const gstSales = voucher.entries.filter((e) => e.ledgerName === 'GST Sales');
    expect(gstSales).toHaveLength(2);
    for (const leg of gstSales) {
      expect(leg.isDebit).toBe(false);
      expect(leg.amount).toBeGreaterThan(0);
    }

    // The voucher balances under the sign convention.
    let dr = 0;
    let cr = 0;
    for (const e of voucher.entries) {
      if (e.isDebit) dr += e.amount;
      else cr += e.amount;
    }
    expect(dr).toBe(cr);
  });

  it('carries the accounting allocation as a real voucher leg with its inventory', () => {
    const parsed = parseTallyXml(DAYBOOK_SALES_GST);
    const voucher = parsed.vouchers[0];

    const gstSales = voucher.entries.filter((e) => e.ledgerName === 'GST Sales');
    expect(gstSales[0].inventoryEntries).toHaveLength(1);
    const inv = gstSales[0].inventoryEntries![0];

    expect(inv.stockItemName).toBe('PONKATHIR PUTTU PODI 500GM');
    expect(inv.quantity).toBe(6);
    expect(inv.rate).toBe(4267); // 42.67 in paise
    expect(inv.amount).toBe(25602);
    expect(inv.godownName).toBe('Main Location');
    expect(inv.batchName).toBe('Primary Batch');
    expect(inv.entryType).toBe('Outward');
  });

  it('parses inventory written inline in the ledger entry', () => {
    const parsed = parseTallyXml(DAYBOOK_INLINE_INVENTORY);
    const voucher = parsed.vouchers[0];

    // The "GST Sales" leg keeps the entry total, not the last item amount.
    const gstSales = voucher.entries.find((e) => e.ledgerName === 'GST Sales')!;
    expect(gstSales.amount).toBe(111160);

    expect(gstSales.inventoryEntries).toHaveLength(1);
    const inv = gstSales.inventoryEntries![0];
    expect(inv.stockItemName).toBe('PONKATHIR CHEMBA PUTTUPODI500GM');
    expect(inv.quantity).toBe(7);
    expect(inv.rate).toBe(6064);
    expect(inv.amount).toBe(42448);
    expect(inv.godownName).toBe('Main Location');

    let dr = 0;
    let cr = 0;
    for (const e of voucher.entries) {
      if (e.isDebit) dr += e.amount;
      else cr += e.amount;
    }
    expect(dr).toBe(cr);
  });

  it('imports a DayBook voucher, creating the masters the file only names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-daybook-'));
    tempDirs.push(dir);
    const regDb = openDatabase(path.join(dir, 'registry.db'));
    migrate(regDb);
    const reg = new CompanyRegistry(regDb, dir);
    const created = reg.create({
      name: 'DayBook Demo',
      financialYearBegin: '2023-04-01',
      booksBegin: '2023-04-01',
    });
    const db = openDatabase(created.dbPath);

    const result = importTallyData(db, created.companyId, parseTallyXml(DAYBOOK_SALES_GST));

    expect(result.errors).toEqual([]);
    expect(result.vouchersImported).toBe(1);
    expect(result.vouchersSkipped).toBe(0);
    expect(result.reconciliation.isBalanced).toBe(true);

    // "Sales GST" is not a stock LedgerDesk voucher type — it is created.
    const vt = db
      .prepare(`SELECT name FROM voucher_type WHERE company_id = ? AND name = 'Sales GST'`)
      .get(created.companyId) as { name: string } | undefined;
    expect(vt).toBeDefined();

    // The stock items, godown and batch named by the voucher exist.
    const items = db
      .prepare(`SELECT name FROM stock_item WHERE company_id = ?`)
      .all(created.companyId) as { name: string }[];
    expect(items.map((i) => i.name)).toContain('PONKATHIR PUTTU PODI 500GM');

    const godowns = db
      .prepare(`SELECT name FROM godown WHERE company_id = ?`)
      .all(created.companyId) as { name: string }[];
    expect(godowns.map((g) => g.name)).toContain('Main Location');

    const batches = db
      .prepare(`SELECT name FROM batch WHERE company_id = ?`)
      .all(created.companyId) as { name: string }[];
    expect(batches.map((b) => b.name)).toContain('Primary Batch');

    // The stock movement is booked, not dropped.
    const stockLedger = db
      .prepare(`
        SELECT si.name AS item, sl.inward_qty, sl.outward_qty, sl.rate, sl.value
        FROM stock_ledger sl
        JOIN stock_item si ON si.id = sl.stock_item_id
        WHERE sl.company_id = ?
      `)
      .all(created.companyId) as {
      item: string;
      inward_qty: number;
      outward_qty: number;
      rate: number;
      value: number;
    }[];
    expect(stockLedger).toHaveLength(2);

    const movement = stockLedger.find((r) => r.item === 'PONKATHIR PUTTU PODI 500GM')!;
    expect(movement.outward_qty).toBe(6);
    expect(movement.rate).toBe(4267);
    expect(movement.value).toBe(25602);

    const second = stockLedger.find((r) => r.item === 'PONKATHIR CHEMBA PUTTUPODI500GM')!;
    expect(second.outward_qty).toBe(6);
    expect(second.rate).toBe(5486);
    expect(second.value).toBe(32916);

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('keeps vouchers from different financial years apart when numbers repeat', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-daybook-fy-'));
    tempDirs.push(dir);
    const regDb = openDatabase(path.join(dir, 'registry.db'));
    migrate(regDb);
    const reg = new CompanyRegistry(regDb, dir);
    const created = reg.create({
      name: 'DayBook FY Demo',
      financialYearBegin: '2023-04-01',
      booksBegin: '2023-04-01',
    });
    const db = openDatabase(created.dbPath);

    const first = importTallyData(db, created.companyId, parseTallyXml(DAYBOOK_SALES_GST));
    expect(first.vouchersImported).toBe(1);

    // The next year reuses the same voucher number.
    const second = importTallyData(db, created.companyId, parseTallyXml(DAYBOOK_SALES_GST_NEXT_YEAR));
    expect(second.vouchersImported).toBe(1);
    expect(second.errors).toEqual([]);

    const numbers = db
      .prepare(`SELECT voucher_number, reference_no FROM voucher WHERE company_id = ? ORDER BY date`)
      .all(created.companyId) as { voucher_number: string; reference_no: string }[];

    expect(numbers).toHaveLength(2);
    // The second one is suffixed with its financial year and keeps the
    // original Tally number in the reference.
    expect(numbers[0].voucher_number).toBe('KRL001/23-24');
    expect(numbers[1].voucher_number).toBe('KRL001/23-24/2024-25');
    expect(numbers[1].reference_no).toContain('KRL001/23-24');

    closeDatabase(db);
    closeDatabase(regDb);
  });

  it('reads a UTF-16 file from disk without loading it whole', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-daybook-utf16-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'DayBook.xml');

    // Tally on Windows writes UTF-16 LE with a byte order mark.
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(DAYBOOK_SALES_GST, 'utf16le')]));

    const parsed = parseTallyXmlFile(file);
    expect(parsed.vouchers).toHaveLength(1);
    expect(parsed.vouchers[0].entries.length).toBeGreaterThan(0);
  });
});
