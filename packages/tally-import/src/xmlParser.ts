import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { toMinorUnits } from '@ledgerdesk/db';
import type {
  TallyGroupImport,
  TallyImportData,
  TallyLedgerImport,
  TallyVoucherEntryImport,
  TallyVoucherImport,
} from './types.js';

function getTagText(parent: XmlElement, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() ?? '';
}

function parseTallyDate(raw: string): string {
  const clean = raw.trim();
  // Format YYYYMMDD e.g. "20250410"
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  // Format ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseTallyAmount(rawAmount: string, isDeemedPositive?: string): { amount: number; isDebit: boolean } {
  const clean = rawAmount.trim();
  const num = parseFloat(clean);
  if (Number.isNaN(num)) {
    return { amount: 0, isDebit: true };
  }

  // In Tally XML:
  // ISDEEMEDPOSITIVE == 'Yes' means DEBIT
  // OR negative amount like -1000.00 means DEBIT
  const isDebit = isDeemedPositive?.toLowerCase() === 'yes' || num < 0;
  const absMajor = Math.abs(num);
  const minor = Number(toMinorUnits(absMajor.toFixed(2)));

  return { amount: minor, isDebit };
}

export function parseTallyXml(xmlString: string): TallyImportData {
  // Clean XML: remove control characters and trim
  const sanitized = xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  const parser = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level === 'fatalError') {
        throw new Error(`XML Parsing error: ${msg}`);
      }
    },
  });

  const doc = parser.parseFromString(sanitized, 'text/xml');

  const groups: TallyGroupImport[] = [];
  const ledgers: TallyLedgerImport[] = [];
  const vouchers: TallyVoucherImport[] = [];

  // Parse Groups
  const groupNodes = doc.getElementsByTagName('GROUP');
  for (let i = 0; i < groupNodes.length; i++) {
    const el = groupNodes[i];
    const name = el.getAttribute('NAME') || getTagText(el, 'NAME');
    if (!name) continue;
    const parentName = getTagText(el, 'PARENT');
    groups.push({
      name,
      parentName: parentName || undefined,
    });
  }

  // Parse Ledgers
  const ledgerNodes = doc.getElementsByTagName('LEDGER');
  for (let i = 0; i < ledgerNodes.length; i++) {
    const el = ledgerNodes[i];
    const name = el.getAttribute('NAME') || getTagText(el, 'NAME');
    if (!name) continue;

    const parentGroup = getTagText(el, 'PARENT') || 'Suspense A/c';
    const rawOpening = getTagText(el, 'OPENINGBALANCE') || '0';
    const isDeemedPos = getTagText(el, 'ISDEEMEDPOSITIVE');
    const { amount: openingBalance, isDebit: openingIsDebit } = parseTallyAmount(rawOpening, isDeemedPos);

    const state = getTagText(el, 'LEDSTATENAME');
    const country = getTagText(el, 'COUNTRYNAME') || 'India';
    const pin = getTagText(el, 'PINCODE');
    const pan = getTagText(el, 'INCOMETAXNUMBER');
    const gstin = getTagText(el, 'PARTYGSTIN');
    const gstRegType = getTagText(el, 'GSTREGISTRATIONTYPE');
    const billwise = getTagText(el, 'ISBILLWISEON').toLowerCase() === 'yes';

    ledgers.push({
      name,
      parentGroup,
      openingBalance,
      openingIsDebit,
      state: state || undefined,
      country,
      pin: pin || undefined,
      pan: pan || undefined,
      gstin: gstin || undefined,
      gstRegistrationType: gstRegType || undefined,
      maintainBillByBill: billwise,
    });
  }

  // Parse Vouchers
  const voucherNodes = doc.getElementsByTagName('VOUCHER');
  for (let i = 0; i < voucherNodes.length; i++) {
    const vEl = voucherNodes[i];
    const voucherType = vEl.getAttribute('VCHTYPE') || getTagText(vEl, 'VOUCHERTYPENAME') || 'Journal';
    const voucherNumber = getTagText(vEl, 'VOUCHERNUMBER') || `${i + 1}`;
    const dateRaw = getTagText(vEl, 'DATE');
    const date = parseTallyDate(dateRaw);
    const referenceNo = getTagText(vEl, 'REFERENCE');
    const narration = getTagText(vEl, 'NARRATION');
    const guid = getTagText(vEl, 'GUID');

    // Extract entries from ALLLEDGERENTRIES.LIST or LEDGERENTRIES.LIST
    const entryNodes = [
      ...Array.from(vEl.getElementsByTagName('ALLLEDGERENTRIES.LIST')),
      ...Array.from(vEl.getElementsByTagName('LEDGERENTRIES.LIST')),
    ];

    const entries: TallyVoucherEntryImport[] = [];

    for (const eEl of entryNodes) {
      const ledgerName = getTagText(eEl, 'LEDGERNAME');
      if (!ledgerName) continue;

      const rawAmount = getTagText(eEl, 'AMOUNT');
      const isDeemedPos = getTagText(eEl, 'ISDEEMEDPOSITIVE');
      const { amount, isDebit } = parseTallyAmount(rawAmount, isDeemedPos);
      const entryNarration = getTagText(eEl, 'NARRATION');

      // Bill Allocations
      const billNodes = Array.from(eEl.getElementsByTagName('BILLALLOCATIONS.LIST'));
      const billAllocations: TallyVoucherEntryImport['billAllocations'] = [];

      for (const bEl of billNodes) {
        const refName = getTagText(bEl, 'NAME');
        const rawBillType = getTagText(bEl, 'BILLTYPE');
        const refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account' =
          rawBillType.includes('Agst')
            ? 'Agst Ref'
            : rawBillType.includes('Advance')
              ? 'Advance'
              : rawBillType.includes('Account')
                ? 'On Account'
                : 'New Ref';

        const rawBillAmount = getTagText(bEl, 'AMOUNT');
        const { amount: billAmount, isDebit: billIsDebit } = parseTallyAmount(rawBillAmount, isDeemedPos);

        if (refName) {
          billAllocations.push({
            refType,
            refName,
            amount: billAmount,
            isDebit: billIsDebit,
          });
        }
      }

      entries.push({
        ledgerName,
        isDebit,
        amount,
        narration: entryNarration || undefined,
        billAllocations: billAllocations.length > 0 ? billAllocations : undefined,
      });
    }

    if (entries.length > 0) {
      vouchers.push({
        voucherType,
        voucherNumber,
        date,
        referenceNo: referenceNo || undefined,
        narration: narration || undefined,
        guid: guid || undefined,
        entries,
      });
    }
  }

  return {
    groups,
    ledgers,
    vouchers,
  };
}
