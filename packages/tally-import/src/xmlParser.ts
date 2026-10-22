import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import sax, { type Tag as SaxTag } from 'sax';
import { toMinorUnits } from '@ledgerdesk/db';
import type {
  TallyBatchImport,
  TallyCostCategoryImport,
  TallyCostCentreImport,
  TallyGodownImport,
  TallyGroupImport,
  TallyImportData,
  TallyLedgerImport,
  TallyStockCategoryImport,
  TallyStockGroupImport,
  TallyStockItemImport,
  TallyUnitImport,
  TallyVoucherEntryImport,
  TallyVoucherImport,
} from './types.js';

/** Parse a Tally money string ("42.67", "42.67/Nos") into minor units. */
function parseTallyMoney(raw: string): number {
  if (!raw) return 0;
  const clean = String(raw).trim().split('/')[0].trim();
  const num = parseFloat(clean);
  if (Number.isNaN(num)) return 0;
  return Number(toMinorUnits(Math.abs(num).toFixed(2)));
}

/** Parse a Tally quantity string (" 6 Nos", "10") into a number. */
function parseTallyQuantity(raw: string): number {
  if (!raw) return 0;
  const clean = String(raw).trim().split(' ')[0].trim();
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : num;
}

function parseTallyDate(raw: string): string {
  const clean = String(raw || '').trim();
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  return new Date().toISOString().slice(0, 10);
}

/** A ledger-entry element being built: ALLLEDGERENTRIES.LIST / LEDGERENTRIES.LIST */
interface InlineInventory {
  stockItemName: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  godownName?: string;
  batchName?: string;
  isDeemedPositive?: boolean;
}

interface EntryFrame {
  kind: 'entry';
  data: Record<string, any>;
  bills: TallyVoucherEntryImport['billAllocations'];
  costs: TallyVoucherEntryImport['costAllocations'];
  inventory: NonNullable<TallyVoucherEntryImport['inventoryEntries']>;
  /** Inventory items written inline inside the ledger entry (no LIST wrapper). */
  inline: InlineInventory[];
  inlineCurrent: InlineInventory | null;
}

/** A bill-allocation element being built: BILLALLOCATIONS.LIST */
interface BillFrame {
  kind: 'bill';
  data: Record<string, any>;
}

/** A cost-allocation element being built: COSTALLOCATIONS.LIST */
interface CostFrame {
  kind: 'cost';
  data: Record<string, any>;
}

/** An inventory element being built: ALLINVENTORYENTRIES.LIST */
interface InventoryFrame {
  kind: 'inventory';
  data: Record<string, any>;
  allocations: {
    ledgerName: string;
    amount: number;
    isNegativeAmount?: boolean;
    isDeemedPositive?: boolean;
  }[];
}

interface AccountingFrame {
  kind: 'accounting';
  data: Record<string, any>;
}

/** A batch-allocation element being built: BATCHALLOCATIONS.LIST */
interface BatchFrame {
  kind: 'batch';
  data: Record<string, any>;
}

type Frame = EntryFrame | BillFrame | CostFrame | InventoryFrame | AccountingFrame | BatchFrame;

/**
 * Tally XML carries two independent Dr/Cr signals and they disagree:
 *
 *  - `ISDEEMEDPOSITIVE` = "Yes" means Debit. Reliable for plain vouchers
 *    (Receipt, Payment, Journal, Contra) but wrong for most GST vouchers.
 *  - A negative `AMOUNT` means Debit. This is the convention TallyPrime
 *    uses and it balances 100% of real GST exports, but plain vouchers
 *    from ERP 9 often leave the sign off and rely on ISDEEMEDPOSITIVE.
 *
 * Rather than hard-coding one convention for the whole file, resolve it per
 * voucher: pick whichever signal makes that voucher's legs balance. This
 * handles mixed exports (and the two sample formats used in the tests).
 */
function resolveDebitCredit(entries: TallyVoucherEntryImport[]): TallyVoucherEntryImport[] {
  const balances = (useSign: boolean): boolean => {
    let dr = 0;
    let cr = 0;
    for (const e of entries) {
      const isDebit = useSign
        ? e.isNegativeAmount === true
        : e.isDeemedPositive === true;
      if (isDebit) dr += e.amount;
      else cr += e.amount;
    }
    return dr === cr;
  };

  const hasSignSignal = entries.some((e) => e.isNegativeAmount === true);
  const hasFlagSignal = entries.some((e) => e.isDeemedPositive === true);

  let resolved: TallyVoucherEntryImport[];
  if (hasSignSignal && balances(true)) {
    resolved = entries.map((e) => ({ ...e, isDebit: e.isNegativeAmount === true }));
  } else if (hasFlagSignal && balances(false)) {
    resolved = entries.map((e) => ({ ...e, isDebit: e.isDeemedPositive === true }));
  } else if (hasSignSignal) {
    resolved = entries.map((e) => ({ ...e, isDebit: e.isNegativeAmount === true }));
  } else if (hasFlagSignal) {
    resolved = entries.map((e) => ({ ...e, isDebit: e.isDeemedPositive === true }));
  } else {
    resolved = entries.map((e) => ({ ...e, isDebit: true }));
  }

  // A bill allocation always takes the direction of the ledger entry it
  // hangs off, so align it with the resolved entry.
  for (const e of resolved) {
    if (e.billAllocations) {
      for (const b of e.billAllocations) {
        b.isDebit = e.isDebit;
      }
    }
  }

  return resolved;
}

/**
 * Streaming Tally XML parser.
 *
 * Handles files of any size (300 MB+ DayBook exports included) with flat
 * memory usage, and copes with the quirks of real Tally exports:
 *   - UTF-16 (LE/BE) and UTF-8 encodings
 *   - illegal control-character references such as `&#4;`
 *   - rates carrying a unit suffix ("42.67/Nos")
 *   - quantities carrying a unit suffix (" 6 Nos")
 *   - inventory entries that live at voucher level, not inside ledger entries
 *   - no `ENTRYTYPE` tag — direction comes from `ISDEEMEDPOSITIVE`
 */
export function parseTallyXml(input: string | Buffer): TallyImportData {
  const p = createTallyParser();
  if (Buffer.isBuffer(input)) {
    p.write(decodeBuffer(input));
  } else {
    p.write(String(input));
  }
  p.close();
  return p.result();
}

/**
 * Detect the encoding of a Tally XML buffer and decode it.
 * Tally exports are usually UTF-16 LE on Windows; some are UTF-8.
 */
export function decodeBuffer(input: Buffer): string {
  if (input.length >= 2) {
    if (input[0] === 0xff && input[1] === 0xfe) {
      return input.toString('utf16le');
    }
    if (input[0] === 0xfe && input[1] === 0xff) {
      return input.swap16().toString('utf16le');
    }
  }
  return input.toString('utf8');
}

/**
 * Parse a Tally XML file from disk without ever holding the whole file in
 * memory. Large DayBook exports (300 MB+) are read in chunks and fed
 * straight to the SAX parser, so peak memory stays flat.
 */
export function parseTallyXmlFile(filePath: string): TallyImportData {
  const p = createTallyParser();
  const fd = fs.openSync(filePath, 'r');
  try {
    const CHUNK = 1 << 20; // 1 MiB
    const buf = Buffer.allocUnsafe(CHUNK);
    // Peek at the first bytes to work out the encoding.
    const head = Buffer.allocUnsafe(4);
    const headLen = fs.readSync(fd, head, 0, 4, 0);
    const encoding = detectEncoding(head.subarray(0, headLen));

    const decoder = new StringDecoder(encoding);
    let position = 0;
    let read: number;
    while ((read = fs.readSync(fd, buf, 0, CHUNK, position)) > 0) {
      position += read;
      p.write(decoder.write(buf.subarray(0, read)));
    }
    p.write(decoder.end());
    p.close();
  } finally {
    fs.closeSync(fd);
  }
  return p.result();
}

function detectEncoding(head: Buffer): BufferEncoding {
  if (head.length >= 2) {
    if (head[0] === 0xff && head[1] === 0xfe) return 'utf16le';
    if (head[0] === 0xfe && head[1] === 0xff) return 'utf16le';
  }
  return 'utf8';
}

/**
 * Create an incremental Tally XML parser. Feed it chunks with write() and
 * call close() when the document ends.
 */
export function createTallyParser(): {
  write: (chunk: string) => void;
  close: () => void;
  result: () => TallyImportData;
} {
  const groups: TallyGroupImport[] = [];
  const ledgers: TallyLedgerImport[] = [];
  const vouchers: TallyVoucherImport[] = [];
  const costCategories: TallyCostCategoryImport[] = [];
  const costCentres: TallyCostCentreImport[] = [];
  const units: TallyUnitImport[] = [];
  const stockGroups: TallyStockGroupImport[] = [];
  const stockCategories: TallyStockCategoryImport[] = [];
  const godowns: TallyGodownImport[] = [];
  const stockItems: TallyStockItemImport[] = [];
  const batches: TallyBatchImport[] = [];

  const parser = sax.parser(false, { lowercase: true });

  let textBuffer = '';

  // The master entity currently being read (group, ledger, stockitem, ...).
  let activeEntity: string | null = null;
  let entityData: Record<string, any> = {};

  // Stack of open structural elements.
  const stack: Frame[] = [];

  // The topmost frame of a given kind, if any.
  function topOf<K extends Frame['kind']>(kind: K): Extract<Frame, { kind: K }> | undefined {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].kind === kind) return stack[i] as Extract<Frame, { kind: K }>;
    }
    return undefined;
  }

  let voucherEntries: TallyVoucherEntryImport[] = [];

  parser.onopentag = (node: SaxTag) => {
    const tag = node.name.toLowerCase();
    const attrs = node.attributes as Record<string, string>;

    if (tag === 'group') {
      activeEntity = 'group';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'ledger') {
      activeEntity = 'ledger';
      entityData = { name: attrs.name || '', parentGroup: '' };
    } else if (tag === 'costcategory') {
      activeEntity = 'costcategory';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'costcentre') {
      activeEntity = 'costcentre';
      entityData = { name: attrs.name || '', categoryName: 'Primary Cost Category' };
    } else if (tag === 'unit') {
      activeEntity = 'unit';
      entityData = { symbol: attrs.name || '', formalName: '', decimalPlaces: 0 };
    } else if (tag === 'stockgroup') {
      activeEntity = 'stockgroup';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'stockcategory') {
      activeEntity = 'stockcategory';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'godown') {
      activeEntity = 'godown';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'stockitem') {
      activeEntity = 'stockitem';
      entityData = { name: attrs.name || '', unitSymbol: 'PCS' };
    } else if (tag === 'batch') {
      activeEntity = 'batch';
      entityData = { name: attrs.name || '' };
    } else if (tag === 'voucher') {
      activeEntity = 'voucher';
      entityData = {
        voucherType: attrs.vchtype || 'Journal',
        voucherNumber: '1',
        date: new Date().toISOString().slice(0, 10),
      };
      voucherEntries = [];
    } else if (tag === 'allledgerentries.list' || tag === 'ledgerentries.list') {
      stack.push({
        kind: 'entry',
        data: {},
        bills: undefined,
        costs: undefined,
        inventory: [],
        inline: [],
        inlineCurrent: null,
      });
    } else if (tag === 'billallocations.list') {
      stack.push({ kind: 'bill', data: {} });
    } else if (tag === 'costallocations.list') {
      stack.push({ kind: 'cost', data: {} });
    } else if (tag === 'allinventoryentries.list') {
      stack.push({ kind: 'inventory', data: {}, allocations: [] });
    } else if (tag === 'accountingallocations.list') {
      stack.push({ kind: 'accounting', data: {} });
    } else if (tag === 'batchallocations.list') {
      stack.push({ kind: 'batch', data: {} });
    }

    textBuffer = '';
  };

  parser.ontext = (text: string) => {
    textBuffer += text;
  };

  parser.oncdata = (text: string) => {
    textBuffer += text;
  };

  parser.onclosetag = (tagName: string) => {
    const tag = tagName.toLowerCase();
    const val = textBuffer.trim();

    // --- Leaf text values on master entities ------------------------------
    if (activeEntity === 'group') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'parent') entityData.parentName = val || undefined;
    } else if (activeEntity === 'ledger') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'parent') entityData.parentGroup = val || '';
      if (tag === 'openingbalance') {
        const num = parseFloat(val) || 0;
        entityData.openingBalance = Number(toMinorUnits(Math.abs(num).toFixed(2)));
        entityData.openingIsDebit = num < 0;
      }
      if (tag === 'ledstatename') entityData.state = val || undefined;
      if (tag === 'countryname') entityData.country = val || 'India';
      if (tag === 'pincode') entityData.pin = val || undefined;
      if (tag === 'incometaxnumber') entityData.pan = val || undefined;
      if (tag === 'partygstin') entityData.gstin = val || undefined;
      if (tag === 'gstregistrationtype') entityData.gstRegistrationType = val || undefined;
      if (tag === 'isbillwiseon') entityData.maintainBillByBill = val.toLowerCase() === 'yes';
    } else if (activeEntity === 'costcategory') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'allocaterevenue') entityData.allocateRevenue = val.toLowerCase() === 'yes';
      if (tag === 'allocatenonrevenue') entityData.allocateNonRevenue = val.toLowerCase() === 'yes';
    } else if (activeEntity === 'costcentre') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'costcategoryname') entityData.categoryName = val || 'Primary Cost Category';
      if (tag === 'parent') entityData.parentName = val || undefined;
    } else if (activeEntity === 'unit') {
      if (tag === 'symbol' || tag === 'name') {
        if (!entityData.symbol) entityData.symbol = val;
        if (!entityData.formalName) entityData.formalName = val;
      }
      if (tag === 'formalname') entityData.formalName = val || entityData.symbol;
      if (tag === 'decimalplaces') entityData.decimalPlaces = parseInt(val, 10) || 0;
      if (tag === 'iscompound') entityData.isCompound = val.toLowerCase() === 'yes';
      if (tag === 'baseunit') entityData.baseUnitSymbol = val || undefined;
      if (tag === 'conversion') entityData.conversionFactor = parseFloat(val) || undefined;
    } else if (activeEntity === 'stockgroup') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'parent') entityData.parentName = val || undefined;
    } else if (activeEntity === 'stockcategory') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'parent') entityData.parentName = val || undefined;
    } else if (activeEntity === 'godown') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'parent') entityData.parentName = val || undefined;
    } else if (activeEntity === 'stockitem') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'alias') entityData.alias = val;
      if (tag === 'partno') entityData.partNo = val;
      if (tag === 'parent' || tag === 'stockgroupname') entityData.groupName = val || undefined;
      if (tag === 'stockcategoryname') entityData.categoryName = val || undefined;
      if (tag === 'baseunits' || tag === 'unitname') entityData.unitSymbol = val || 'PCS';
      if (tag === 'alternateunits' || tag === 'alternateunitname') entityData.alternateUnitSymbol = val || undefined;
      if (tag === 'altconversionnumerator') entityData.altConversionNumerator = parseFloat(val) || undefined;
      if (tag === 'altconversiondenominator') entityData.altConversionDenominator = parseFloat(val) || undefined;
      if (tag === 'costingmethod') entityData.costingMethod = val || 'Avg Cost';
      if (tag === 'openingquantity') entityData.openingQuantity = parseFloat(val) || 0;
      if (tag === 'openingrate') entityData.openingRate = parseTallyMoney(val);
      if (tag === 'openingvalue') entityData.openingValue = parseTallyMoney(val);
      if (tag === 'openinggodownname') entityData.openingGodownName = val || undefined;
      if (tag === 'maintainbatches') entityData.maintainBatches = val.toLowerCase() === 'yes';
      if (tag === 'trackmanufacturingdate') entityData.trackManufacturingDate = val.toLowerCase() === 'yes';
      if (tag === 'trackexpirydate') entityData.trackExpiryDate = val.toLowerCase() === 'yes';
      if (tag === 'reorderlevel') entityData.reorderLevel = parseFloat(val) || undefined;
      if (tag === 'minorderqty') entityData.minOrderQty = parseFloat(val) || undefined;
      if (tag === 'hsn_sac' || tag === 'hsncode') entityData.hsnSac = val || undefined;
      if (tag === 'gsttaxability') entityData.gstTaxability = val || 'Taxable';
      if (tag === 'gstrate') entityData.gstRate = parseFloat(val) || 0;
      if (tag === 'cessrate') entityData.cessRate = parseFloat(val) || 0;
      if (tag === 'description') entityData.description = val || undefined;
    } else if (activeEntity === 'batch') {
      if (tag === 'name' && !entityData.name) entityData.name = val;
      if (tag === 'stockitemname' || tag === 'parent') entityData.stockItemName = val;
      if (tag === 'godownname') entityData.godownName = val || undefined;
      if (tag === 'mfgdate') entityData.manufacturingDate = val || undefined;
      if (tag === 'expirydate') entityData.expiryDate = val || undefined;
      if (tag === 'openingquantity') entityData.openingQuantity = parseFloat(val) || 0;
      if (tag === 'openingrate') entityData.openingRate = parseTallyMoney(val);
      if (tag === 'openingvalue') entityData.openingValue = parseTallyMoney(val);
    } else if (activeEntity === 'voucher') {
      if (tag === 'date') entityData.date = parseTallyDate(val);
      if (tag === 'vouchertypename') entityData.voucherType = val || entityData.voucherType;
      if (tag === 'vouchernumber') entityData.voucherNumber = val || '1';
      if (tag === 'reference') entityData.referenceNo = val || undefined;
      if (tag === 'narration') entityData.narration = val || undefined;
      if (tag === 'guid') entityData.guid = val || undefined;
    }

    // --- Values that belong to a structural frame -------------------------
    const bill = topOf('bill');
    const cost = topOf('cost');
    const accounting = topOf('accounting');
    const inventory = topOf('inventory');
    const batch = topOf('batch');
    const entry = topOf('entry');

    if (bill) {
      if (tag === 'name') bill.data.refName = val;
      if (tag === 'billtype') {
        const bt = val;
        bill.data.refType = bt.includes('Agst')
          ? 'Agst Ref'
          : bt.includes('Advance')
            ? 'Advance'
            : bt.includes('Account')
              ? 'On Account'
              : 'New Ref';
      }
      if (tag === 'amount') bill.data.amount = parseTallyMoney(val);
      if (tag === 'duedate') bill.data.dueDate = parseTallyDate(val);
    } else if (cost) {
      if (tag === 'costcentrename' || tag === 'name') cost.data.costCentreName = val;
      if (tag === 'costcategoryname') cost.data.costCategoryName = val || undefined;
      if (tag === 'amount') cost.data.amount = parseTallyMoney(val);
    } else if (accounting) {
      // ACCOUNTINGALLOCATIONS.LIST carries the sales/purchase contra ledger
      // of an inventory entry (e.g. "GST Sales", "GST Purchase").
      if (tag === 'ledgername') accounting.data.ledgerName = val;
      if (tag === 'amount') {
        const num = parseFloat(val) || 0;
        accounting.data.amount = Number(toMinorUnits(Math.abs(num).toFixed(2)));
        accounting.data.isNegativeAmount = num < 0;
      }
      if (tag === 'isdeemedpositive') {
        accounting.data.isDeemedPositive = val.toLowerCase() === 'yes';
      }
    } else if (inventory) {
      if (tag === 'stockitemname' || tag === 'ledgername') inventory.data.stockItemName = val;
      if (tag === 'actualqty' || tag === 'billedqty' || tag === 'quantity') {
        inventory.data.quantity = parseTallyQuantity(val);
      }
      if (tag === 'rate') inventory.data.rate = parseTallyMoney(val);
      if (tag === 'amount') inventory.data.amount = parseTallyMoney(val);
      if (tag === 'godownname') inventory.data.godownName = val || undefined;
      if (tag === 'batchname') inventory.data.batchName = val || undefined;
      if (tag === 'mfgdate') inventory.data.manufacturingDate = val || undefined;
      if (tag === 'expirydate') inventory.data.expiryDate = val || undefined;
      if (tag === 'trackingnumber') inventory.data.trackingNumber = val || undefined;
      if (tag === 'ordernumber') inventory.data.orderNumber = val || undefined;
      if (tag === 'isdeemedpositive') {
        inventory.data.isDeemedPositive = val.toLowerCase() === 'yes';
      }
    } else if (batch) {
      if (tag === 'godownname') batch.data.godownName = val || undefined;
      if (tag === 'batchname') batch.data.batchName = val || undefined;
      if (tag === 'mfgdate') batch.data.manufacturingDate = val || undefined;
      if (tag === 'expirydate') batch.data.expiryDate = val || undefined;
    } else if (entry) {
      if (tag === 'ledgername') entry.data.ledgerName = val;
      if (tag === 'narration') entry.data.narration = val || undefined;
      if (tag === 'amount') {
        const num = parseFloat(val) || 0;
        // Tally's export convention: a negative AMOUNT means Debit. This is
        // the signal that balances 100% of real TallyPrime/GST exports, so
        // it is captured separately from ISDEEMEDPOSITIVE and the importer
        // resolves the convention per voucher.
        //
        // Some Tally exports write the inventory items inline inside the
        // ledger entry, each with its own AMOUNT. In that case the entry's
        // total is the first AMOUNT (the one right after LEDGERNAME) and
        // later AMOUNTs belong to the inline item.
        if (entry.inlineCurrent) {
          entry.inlineCurrent.amount = Number(toMinorUnits(Math.abs(num).toFixed(2)));
        } else {
          entry.data.amount = Number(toMinorUnits(Math.abs(num).toFixed(2)));
          entry.data.isNegativeAmount = num < 0;
        }
      }
      if (tag === 'isdeemedpositive') {
        // Tally's rule: IsDeemedPositive = Yes means the entry is a Debit.
        if (entry.inlineCurrent) {
          entry.inlineCurrent.isDeemedPositive = val.toLowerCase() === 'yes';
        } else {
          entry.data.isDeemedPositive = val.toLowerCase() === 'yes';
        }
      }
      if (tag === 'stockitemname') {
        // An inline inventory item inside a ledger entry.
        entry.inlineCurrent = {
          stockItemName: val,
        };
        entry.inline.push(entry.inlineCurrent);
      }
      if (tag === 'rate' && entry.inlineCurrent) {
        entry.inlineCurrent.rate = parseTallyMoney(val);
      }
      if (tag === 'actualqty' || tag === 'billedqty' || tag === 'quantity') {
        if (entry.inlineCurrent) {
          entry.inlineCurrent.quantity = parseTallyQuantity(val);
        }
      }
      if (tag === 'godownname' && entry.inlineCurrent) {
        entry.inlineCurrent.godownName = val || undefined;
      }
    }

    // --- Closing structural frames ----------------------------------------
    if (
      tag === 'billallocations.list' ||
      tag === 'costallocations.list' ||
      tag === 'accountingallocations.list' ||
      tag === 'allinventoryentries.list' ||
      tag === 'batchallocations.list' ||
      tag === 'allledgerentries.list' ||
      tag === 'ledgerentries.list'
    ) {
      // Pop the matching frame (it is the topmost one of its kind).
      for (let i = stack.length - 1; i >= 0; i--) {
        const frame = stack[i];
        const kindForTag: Record<string, Frame['kind']> = {
          'billallocations.list': 'bill',
          'costallocations.list': 'cost',
          'accountingallocations.list': 'accounting',
          'allinventoryentries.list': 'inventory',
          'batchallocations.list': 'batch',
          'allledgerentries.list': 'entry',
          'ledgerentries.list': 'entry',
        };
        if (frame.kind !== kindForTag[tag]) continue;

        stack.splice(i, 1);

        if (frame.kind === 'bill') {
          if (frame.data.refName) {
            const owner = topOf('entry');
            if (owner) {
              owner.bills ??= [];
              owner.bills.push({
                refType: frame.data.refType ?? 'New Ref',
                refName: frame.data.refName,
                amount: frame.data.amount ?? 0,
                isDebit: frame.data.isDebit ?? true,
                dueDate: frame.data.dueDate,
              });
            }
          }
        } else if (frame.kind === 'cost') {
          if (frame.data.costCentreName) {
            const owner = topOf('entry');
            if (owner) {
              owner.costs ??= [];
              owner.costs.push({
                costCentreName: frame.data.costCentreName,
                costCategoryName: frame.data.costCategoryName,
                amount: frame.data.amount ?? 0,
              });
            }
          }
        } else if (frame.kind === 'accounting') {
          // The accounting allocation belongs to the enclosing inventory
          // entry; it names the ledger that receives the item's value
          // (e.g. "GST Sales" for a sales invoice).
          if (frame.data.ledgerName) {
            const owner = topOf('inventory');
            if (owner) {
              owner.allocations.push({
                ledgerName: frame.data.ledgerName,
                amount: frame.data.amount ?? 0,
                isNegativeAmount: frame.data.isNegativeAmount,
                isDeemedPositive: frame.data.isDeemedPositive,
              });
            }
          }
        } else if (frame.kind === 'batch') {
          const owner = topOf('inventory');
          if (owner) {
            owner.data.godownName ??= frame.data.godownName;
            owner.data.batchName ??= frame.data.batchName;
            owner.data.manufacturingDate ??= frame.data.manufacturingDate;
            owner.data.expiryDate ??= frame.data.expiryDate;
          } else {
            // A batch allocation inside an inline inventory item.
            const entry = topOf('entry');
            const inlineItem = entry?.inlineCurrent;
            if (inlineItem) {
              inlineItem.godownName ??= frame.data.godownName;
              inlineItem.batchName ??= frame.data.batchName;
            }
          }
        } else if (frame.kind === 'inventory') {
          if (frame.data.stockItemName) {
            const vt = (entityData.voucherType || '').toLowerCase();
            // Tally does not emit ENTRYTYPE; direction comes from the
            // inventory entry's own ISDEEMEDPOSITIVE, with the voucher type
            // as a fallback.
            let entryType: 'Inward' | 'Outward' | 'Transfer_Source' | 'Transfer_Dest';
            if (frame.data.isDeemedPositive === true) {
              entryType = 'Inward';
            } else if (frame.data.isDeemedPositive === false) {
              entryType = 'Outward';
            } else if (vt.includes('purchase') || vt.includes('receipt note') || vt.includes('credit note')) {
              entryType = 'Inward';
            } else {
              entryType = 'Outward';
            }

            const inventoryEntry = {
              stockItemName: frame.data.stockItemName,
              quantity: frame.data.quantity ?? 0,
              rate: frame.data.rate ?? 0,
              amount: frame.data.amount ?? 0,
              godownName: frame.data.godownName,
              batchName: frame.data.batchName,
              manufacturingDate: frame.data.manufacturingDate,
              expiryDate: frame.data.expiryDate,
              trackingNumber: frame.data.trackingNumber,
              orderNumber: frame.data.orderNumber,
              entryType,
            };

            if (frame.allocations.length > 0) {
              // The inventory entry carries its own accounting allocation —
              // this is a real voucher leg (the sales/purchase ledger) and
              // must be booked, not folded into the party entry.
              for (const alc of frame.allocations) {
                voucherEntries.push({
                  ledgerName: alc.ledgerName,
                  isDebit: false,
                  amount: alc.amount,
                  isNegativeAmount: alc.isNegativeAmount,
                  isDeemedPositive: alc.isDeemedPositive,
                  inventoryEntries: [inventoryEntry],
                });
              }
            } else {
              // An inventory entry may be nested inside a ledger entry (older
              // Tally exports) or sit at voucher level (TallyPrime). Handle
              // both: prefer the enclosing ledger entry, then an existing
              // entry for the item, then the last entry of the voucher.
              const owner = topOf('entry');
              if (owner) {
                owner.inventory.push(inventoryEntry);
              } else {
                let target = voucherEntries.find((e) => e.ledgerName === frame.data.stockItemName);
                if (!target && voucherEntries.length > 0) {
                  target = voucherEntries[voucherEntries.length - 1];
                }
                if (!target) {
                  target = {
                    ledgerName: frame.data.stockItemName,
                    isDebit: entryType === 'Inward',
                    amount: 0,
                  };
                  voucherEntries.push(target);
                }
                (target.inventoryEntries ??= []).push(inventoryEntry);
              }
            }
          }
        } else if (frame.kind === 'entry') {
          if (frame.data.ledgerName) {
            // Inline inventory items (written straight into the ledger entry
            // with no ALLINVENTORYENTRIES.LIST wrapper) are converted to
            // ordinary inventory entries.
            const inlineEntries: NonNullable<TallyVoucherEntryImport['inventoryEntries']> = [];
            for (const item of frame.inline) {
              if (!item.stockItemName) continue;
              const entryType: 'Inward' | 'Outward' =
                item.isDeemedPositive === true ? 'Inward' : 'Outward';
              inlineEntries.push({
                stockItemName: item.stockItemName,
                quantity: item.quantity ?? 0,
                rate: item.rate ?? 0,
                amount: item.amount ?? 0,
                godownName: item.godownName,
                entryType,
              });
            }

            const allInventory =
              inlineEntries.length > 0
                ? [...frame.inventory, ...inlineEntries]
                : frame.inventory;

            voucherEntries.push({
              ledgerName: frame.data.ledgerName,
              isDebit: false,
              amount: frame.data.amount ?? 0,
              isNegativeAmount: frame.data.isNegativeAmount,
              isDeemedPositive: frame.data.isDeemedPositive,
              narration: frame.data.narration,
              billAllocations: frame.bills,
              costAllocations: frame.costs,
              inventoryEntries: allInventory.length > 0 ? allInventory : undefined,
            });
          }
        }
        break;
      }
    }

    // --- Closing master entities ------------------------------------------
    if (tag === 'group' && activeEntity === 'group') {
      if (entityData.name) {
        groups.push({ name: entityData.name, parentName: entityData.parentName });
      }
      activeEntity = null;
    } else if (tag === 'ledger' && activeEntity === 'ledger') {
      if (entityData.name) {
        ledgers.push({
          name: entityData.name,
          parentGroup: entityData.parentGroup || 'Suspense A/c',
          openingBalance: entityData.openingBalance ?? 0,
          openingIsDebit: entityData.openingIsDebit ?? true,
          state: entityData.state,
          country: entityData.country ?? 'India',
          pin: entityData.pin,
          pan: entityData.pan,
          gstin: entityData.gstin,
          gstRegistrationType: entityData.gstRegistrationType,
          maintainBillByBill: entityData.maintainBillByBill,
        });
      }
      activeEntity = null;
    } else if (tag === 'costcategory' && activeEntity === 'costcategory') {
      if (entityData.name) {
        costCategories.push({
          name: entityData.name,
          allocateRevenue: entityData.allocateRevenue,
          allocateNonRevenue: entityData.allocateNonRevenue,
        });
      }
      activeEntity = null;
    } else if (tag === 'costcentre' && activeEntity === 'costcentre') {
      if (entityData.name) {
        costCentres.push({
          name: entityData.name,
          categoryName: entityData.categoryName ?? 'Primary Cost Category',
          parentName: entityData.parentName,
        });
      }
      activeEntity = null;
    } else if (tag === 'unit' && activeEntity === 'unit') {
      if (entityData.symbol) {
        units.push({
          symbol: entityData.symbol,
          formalName: entityData.formalName || entityData.symbol,
          decimalPlaces: entityData.decimalPlaces ?? 0,
          isCompound: entityData.isCompound,
          baseUnitSymbol: entityData.baseUnitSymbol,
          conversionFactor: entityData.conversionFactor,
        });
      }
      activeEntity = null;
    } else if (tag === 'stockgroup' && activeEntity === 'stockgroup') {
      if (entityData.name) stockGroups.push({ name: entityData.name, parentName: entityData.parentName });
      activeEntity = null;
    } else if (tag === 'stockcategory' && activeEntity === 'stockcategory') {
      if (entityData.name) stockCategories.push({ name: entityData.name, parentName: entityData.parentName });
      activeEntity = null;
    } else if (tag === 'godown' && activeEntity === 'godown') {
      if (entityData.name) godowns.push({ name: entityData.name, parentName: entityData.parentName });
      activeEntity = null;
    } else if (tag === 'stockitem' && activeEntity === 'stockitem') {
      if (entityData.name) {
        stockItems.push({
          name: entityData.name,
          alias: entityData.alias,
          partNo: entityData.partNo,
          groupName: entityData.groupName,
          categoryName: entityData.categoryName,
          unitSymbol: entityData.unitSymbol || 'PCS',
          alternateUnitSymbol: entityData.alternateUnitSymbol,
          altConversionNumerator: entityData.altConversionNumerator,
          altConversionDenominator: entityData.altConversionDenominator,
          costingMethod: entityData.costingMethod || 'Avg Cost',
          openingQuantity: entityData.openingQuantity ?? 0,
          openingRate: entityData.openingRate ?? 0,
          openingValue: entityData.openingValue ?? 0,
          openingGodownName: entityData.openingGodownName,
          maintainBatches: entityData.maintainBatches,
          trackManufacturingDate: entityData.trackManufacturingDate,
          trackExpiryDate: entityData.trackExpiryDate,
          reorderLevel: entityData.reorderLevel,
          minOrderQty: entityData.minOrderQty,
          hsnSac: entityData.hsnSac,
          gstTaxability: entityData.gstTaxability || 'Taxable',
          gstRate: entityData.gstRate ?? 0,
          cessRate: entityData.cessRate ?? 0,
          description: entityData.description,
        });
      }
      activeEntity = null;
    } else if (tag === 'batch' && activeEntity === 'batch') {
      if (entityData.name && entityData.stockItemName) {
        batches.push({
          stockItemName: entityData.stockItemName,
          name: entityData.name,
          godownName: entityData.godownName,
          manufacturingDate: entityData.manufacturingDate,
          expiryDate: entityData.expiryDate,
          openingQuantity: entityData.openingQuantity ?? 0,
          openingRate: entityData.openingRate ?? 0,
          openingValue: entityData.openingValue ?? 0,
        });
      }
      activeEntity = null;
    } else if (tag === 'voucher' && activeEntity === 'voucher') {
      if (voucherEntries.length > 0) {
        vouchers.push({
          voucherType: entityData.voucherType || 'Journal',
          voucherNumber: entityData.voucherNumber || '1',
          date: entityData.date || new Date().toISOString().slice(0, 10),
          referenceNo: entityData.referenceNo,
          narration: entityData.narration,
          guid: entityData.guid,
          entries: resolveDebitCredit(voucherEntries),
        });
      }
      activeEntity = null;
      voucherEntries = [];
    }

    textBuffer = '';
  };

  return {
    write: (chunk: string) => {
      // Strip illegal control characters. `&#4;` is left alone — sax in
      // non-strict mode passes it through as text rather than failing.
      parser.write(chunk.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
    },
    close: () => {
      parser.close();
    },
    result: () => ({
      groups,
      ledgers,
      vouchers,
      costCategories,
      costCentres,
      units,
      stockGroups,
      stockCategories,
      godowns,
      stockItems,
      batches,
    }),
  };
}
