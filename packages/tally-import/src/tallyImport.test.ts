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

const SAMPLE_TALLY_XML_WITH_COSTS = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCATEGORY NAME="Primary Cost Category">
            <NAME>Primary Cost Category</NAME>
            <ALLOCATEREVENUE>Yes</ALLOCATEREVENUE>
            <ALLOCATENONREVENUE>No</ALLOCATENONREVENUE>
          </COSTCATEGORY>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCENTRE NAME="Bangalore Branch">
            <NAME>Bangalore Branch</NAME>
            <COSTCATEGORYNAME>Primary Cost Category</COSTCATEGORYNAME>
          </COSTCENTRE>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <UNIT NAME="PCS">
            <SYMBOL>PCS</SYMBOL>
            <FORMALNAME>Pieces</FORMALNAME>
            <DECIMALPLACES>0</DECIMALPLACES>
          </UNIT>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKGROUP NAME="Finished Goods">
            <NAME>Finished Goods</NAME>
            <PARENT>All Stock Groups</PARENT>
          </STOCKGROUP>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GODOWN NAME="Main Warehouse">
            <NAME>Main Warehouse</NAME>
          </GODOWN>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="Steel Rod">
            <NAME>Steel Rod</NAME>
            <PARENT>Finished Goods</PARENT>
            <BASEUNITS>PCS</BASEUNITS>
            <COSTINGMETHOD>FIFO</COSTINGMETHOD>
            <OPENINGQUANTITY>100</OPENINGQUANTITY>
            <OPENINGRATE>50.00</OPENINGRATE>
            <OPENINGVALUE>5000.00</OPENINGVALUE>
            <OPENINGGODOWNNAME>Main Warehouse</OPENINGGODOWNNAME>
            <HSN_SAC>7214</HSN_SAC>
            <GSTRATE>18</GSTRATE>
          </STOCKITEM>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Metro Traders">
            <NAME>Metro Traders</NAME>
            <PARENT>Sundry Debtors</PARENT>
            <OPENINGBALANCE>0</OPENINGBALANCE>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Advertising">
            <NAME>Advertising</NAME>
            <PARENT>Indirect Expenses</PARENT>
            <OPENINGBALANCE>0</OPENINGBALANCE>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20250412</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV-001</VOUCHERNUMBER>
            <NARRATION>Sale with cost allocation</NARRATION>
            <GUID>GUID-COST-001</GUID>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Metro Traders</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>11800.00</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>INV-001</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>11800.00</AMOUNT>
                <DUEDATE>20250512</DUEDATE>
              </BILLALLOCATIONS.LIST>
              <COSTALLOCATIONS.LIST>
                <COSTCENTRENAME>Bangalore Branch</COSTCENTRENAME>
                <AMOUNT>5000.00</AMOUNT>
              </COSTALLOCATIONS.LIST>
              <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>Steel Rod</STOCKITEMNAME>
                <QUANTITY>10</QUANTITY>
                <RATE>50.00</RATE>
                <AMOUNT>500.00</AMOUNT>
                <GODOWNNAME>Main Warehouse</GODOWNNAME>
                <ENTRYTYPE>Outward</ENTRYTYPE>
              </ALLINVENTORYENTRIES.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Advertising</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>11800.00</AMOUNT>
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

  it('detects a native Tally data file and points at the XML server', async () => {
    const reader = new DefaultTallyNativeReader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-detect-data-'));
    tempDirs.push(dir);

    // The file Tally keeps in a company folder alongside .001/.002 data.
    const dataFile = path.join(dir, 'TBK900_10015.001');
    fs.writeFileSync(dataFile, Buffer.alloc(64));

    const detection = await reader.detect(dataFile);
    expect(detection.kind).toBe('TALLY_DATA_FILE');
    expect(detection.guidance).toContain('Tally XML Server');
    expect(detection.guidance).toContain('Gateway of Tally -> Export -> Data -> XML');
  });

  it('detects a Tally XML export so it can be imported straight away', async () => {
    const reader = new DefaultTallyNativeReader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-detect-xml-'));
    tempDirs.push(dir);

    const xmlFile = path.join(dir, 'DayBook.xml');
    fs.writeFileSync(xmlFile, '<ENVELOPE/>');

    const detection = await reader.detect(xmlFile);
    expect(detection.kind).toBe('TALLY_XML_FILE');
  });

  it('parses cost allocations, bill refs and inventory entries from Tally XML', () => {
    const parsed = parseTallyXml(SAMPLE_TALLY_XML_WITH_COSTS);

    expect(parsed.costCategories).toHaveLength(1);
    expect(parsed.costCategories[0].name).toBe('Primary Cost Category');
    expect(parsed.costCentres).toHaveLength(1);
    expect(parsed.costCentres[0].name).toBe('Bangalore Branch');

    expect(parsed.units).toHaveLength(1);
    expect(parsed.units[0].symbol).toBe('PCS');
    expect(parsed.stockGroups).toHaveLength(1);
    expect(parsed.godowns).toHaveLength(1);

    expect(parsed.stockItems).toHaveLength(1);
    const item = parsed.stockItems[0];
    expect(item.name).toBe('Steel Rod');
    expect(item.costingMethod).toBe('FIFO');
    expect(item.openingQuantity).toBe(100);
    expect(item.hsnSac).toBe('7214');
    expect(item.gstRate).toBe(18);

    const voucher = parsed.vouchers[0];
    const entry = voucher.entries[0];

    expect(entry.billAllocations).toHaveLength(1);
    expect(entry.billAllocations![0].refName).toBe('INV-001');
    expect(entry.billAllocations![0].amount).toBe(1180000);

    expect(entry.costAllocations).toHaveLength(1);
    expect(entry.costAllocations![0].costCentreName).toBe('Bangalore Branch');
    expect(entry.costAllocations![0].amount).toBe(500000);

    expect(entry.inventoryEntries).toHaveLength(1);
    expect(entry.inventoryEntries![0].stockItemName).toBe('Steel Rod');
    expect(entry.inventoryEntries![0].quantity).toBe(10);
    expect(entry.inventoryEntries![0].godownName).toBe('Main Warehouse');
    expect(entry.inventoryEntries![0].entryType).toBe('Outward');
  });

  it('persists costs, bill refs, inventory and cost centres into the database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-tally-costs-'));
    tempDirs.push(dir);
    const regDb = openDatabase(path.join(dir, 'registry.db'));
    migrate(regDb);
    const reg = new CompanyRegistry(regDb, dir);
    const created = reg.create({
      name: 'Tally Costs Demo',
      financialYearBegin: '2025-04-01',
      booksBegin: '2025-04-01',
    });
    const db = openDatabase(created.dbPath);
    const companyId = created.companyId;

    const parsed = parseTallyXml(SAMPLE_TALLY_XML_WITH_COSTS);
    const result = importTallyData(db, companyId, parsed);

    expect(result.errors).toEqual([]);
    expect(result.vouchersImported).toBe(1);

    // --- Cost centres landed in the database ---
    const costCentres = db
      .prepare(`SELECT cc.name FROM cost_centre cc WHERE cc.company_id = ?`)
      .all(companyId) as { name: string }[];
    expect(costCentres.map((c) => c.name)).toContain('Bangalore Branch');

    // --- Cost allocation is linked to the voucher entry ---
    const costAllocs = db
      .prepare(`
        SELECT vca.amount, cc.name AS cost_centre
        FROM voucher_cost_allocation vca
        JOIN cost_centre cc ON cc.id = vca.cost_centre_id
        WHERE vca.company_id = ?
      `)
      .all(companyId) as { amount: number; cost_centre: string }[];
    expect(costAllocs).toHaveLength(1);
    expect(costAllocs[0].cost_centre).toBe('Bangalore Branch');
    expect(costAllocs[0].amount).toBe(500000);

    // --- Bill allocation is linked to the party ---
    const billAllocs = db
      .prepare(`
        SELECT vba.ref_name, vba.ref_type, vba.amount, l.name AS party
        FROM voucher_bill_allocation vba
        JOIN ledger l ON l.id = vba.party_ledger_id
        WHERE vba.company_id = ?
      `)
      .all(companyId) as { ref_name: string; ref_type: string; amount: number; party: string }[];
    expect(billAllocs).toHaveLength(1);
    expect(billAllocs[0].ref_name).toBe('INV-001');
    expect(billAllocs[0].ref_type).toBe('New Ref');
    expect(billAllocs[0].amount).toBe(1180000);
    expect(billAllocs[0].party).toBe('Metro Traders');

    // --- Stock item master landed with its costing method ---
    const stockItems = db
      .prepare(`SELECT name, costing_method, unit_id FROM stock_item WHERE company_id = ?`)
      .all(companyId) as { name: string; costing_method: string; unit_id: string }[];
    expect(stockItems).toHaveLength(1);
    expect(stockItems[0].name).toBe('Steel Rod');
    expect(stockItems[0].costing_method).toBe('FIFO');

    // --- Unit and godown masters landed ---
    const units = db.prepare(`SELECT symbol FROM unit WHERE company_id = ?`).all(companyId) as {
      symbol: string;
    }[];
    expect(units.map((u) => u.symbol)).toContain('PCS');

    const godowns = db.prepare(`SELECT name FROM godown WHERE company_id = ?`).all(companyId) as {
      name: string;
    }[];
    expect(godowns.map((g) => g.name)).toContain('Main Warehouse');

    // --- Inventory entry on the voucher ---
    const inventoryEntries = db
      .prepare(`
        SELECT vie.quantity, vie.rate, vie.amount, vie.entry_type, si.name AS item
        FROM voucher_inventory_entry vie
        JOIN stock_item si ON si.id = vie.stock_item_id
        WHERE vie.company_id = ?
      `)
      .all(companyId) as {
      quantity: number;
      rate: number;
      amount: number;
      entry_type: string;
      item: string;
    }[];
    expect(inventoryEntries).toHaveLength(1);
    expect(inventoryEntries[0].item).toBe('Steel Rod');
    expect(inventoryEntries[0].quantity).toBe(10);
    expect(inventoryEntries[0].rate).toBe(5000);
    expect(inventoryEntries[0].amount).toBe(50000);
    expect(inventoryEntries[0].entry_type).toBe('Outward');

    // --- Opening stock is recorded in the stock ledger, and the voucher's
    //     outward movement is posted against the same item ---
    const stockLedger = db
      .prepare(`
        SELECT inward_qty, outward_qty, rate, value, voucher_id
        FROM stock_ledger WHERE company_id = ?
        ORDER BY rowid
      `)
      .all(companyId) as {
      inward_qty: number;
      outward_qty: number;
      rate: number;
      value: number;
      voucher_id: string | null;
    }[];
    expect(stockLedger).toHaveLength(2);

    // Opening row — no voucher, quantity inwards at the opening rate
    expect(stockLedger[0].inward_qty).toBe(100);
    expect(stockLedger[0].outward_qty).toBe(0);
    expect(stockLedger[0].rate).toBe(5000);
    expect(stockLedger[0].value).toBe(500000);
    expect(stockLedger[0].voucher_id).toBeNull();

    // Movement row — 10 units out at the voucher's rate
    expect(stockLedger[1].inward_qty).toBe(0);
    expect(stockLedger[1].outward_qty).toBe(10);
    expect(stockLedger[1].rate).toBe(5000);
    expect(stockLedger[1].value).toBe(50000);
    expect(stockLedger[1].voucher_id).not.toBeNull();

    // --- The books still balance after the import ---
    expect(result.reconciliation.isBalanced).toBe(true);
    expect(result.reconciliation.difference).toBe(0);

    closeDatabase(db);
    closeDatabase(regDb);
  });
});
