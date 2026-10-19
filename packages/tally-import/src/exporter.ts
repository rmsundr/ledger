import {
  fromMinorUnits,
  LedgerRepository,
  type Db,
  type GroupRecord,
  type VoucherRecord,
} from '@ledgerdesk/db';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToTallyXml(db: Db, companyId: string): string {
  const ledgerRepo = new LedgerRepository(db);
  const groups = db
    .prepare(`SELECT * FROM "group" WHERE company_id = ? AND deleted_at IS NULL ORDER BY sort_order, name`)
    .all(companyId) as GroupRecord[];

  const ledgers = ledgerRepo.list(companyId);

  const vouchers = db
    .prepare(`SELECT * FROM voucher WHERE company_id = ? AND deleted_at IS NULL ORDER BY date ASC, created_at ASC`)
    .all(companyId) as VoucherRecord[];

  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    '        <REPORTNAME>All Masters</REPORTNAME>',
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
  ];

  // Groups
  for (const g of groups) {
    const parent = groups.find((p) => p.id === g.parent_id)?.name;
    lines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
    lines.push(`          <GROUP NAME="${escapeXml(g.name)}">`);
    lines.push(`            <NAME>${escapeXml(g.name)}</NAME>`);
    if (parent) {
      lines.push(`            <PARENT>${escapeXml(parent)}</PARENT>`);
    }
    lines.push('          </GROUP>');
    lines.push('        </TALLYMESSAGE>');
  }

  // Ledgers
  for (const l of ledgers) {
    const openingSigned = l.opening_is_debit === 1 ? -l.opening_balance : l.opening_balance;
    const openingMajor = fromMinorUnits(openingSigned);

    lines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
    lines.push(`          <LEDGER NAME="${escapeXml(l.name)}">`);
    lines.push(`            <NAME>${escapeXml(l.name)}</NAME>`);
    lines.push(`            <PARENT>${escapeXml(l.group_name)}</PARENT>`);
    lines.push(`            <OPENINGBALANCE>${openingMajor}</OPENINGBALANCE>`);
    if (l.state) lines.push(`            <LEDSTATENAME>${escapeXml(l.state)}</LEDSTATENAME>`);
    if (l.country) lines.push(`            <COUNTRYNAME>${escapeXml(l.country)}</COUNTRYNAME>`);
    if (l.pin) lines.push(`            <PINCODE>${escapeXml(l.pin)}</PINCODE>`);
    if (l.pan) lines.push(`            <INCOMETAXNUMBER>${escapeXml(l.pan)}</INCOMETAXNUMBER>`);
    if (l.gstin) lines.push(`            <PARTYGSTIN>${escapeXml(l.gstin)}</PARTYGSTIN>`);
    lines.push('          </LEDGER>');
    lines.push('        </TALLYMESSAGE>');
  }

  // Vouchers
  for (const v of vouchers) {
    const entries = db
      .prepare(`
        SELECT vle.*, l.name AS ledger_name
        FROM voucher_ledger_entry vle
        JOIN ledger l ON vle.ledger_id = l.id
        WHERE vle.voucher_id = ?
        ORDER BY vle.entry_index ASC
      `)
      .all(v.id) as { ledger_name: string; is_debit: number; amount: number; narration: string }[];

    const tallyDate = v.date.replace(/-/g, '');

    lines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
    lines.push(`          <VOUCHER VCHTYPE="${escapeXml(v.voucher_type_name)}" ACTION="Create">`);
    lines.push(`            <DATE>${tallyDate}</DATE>`);
    lines.push(`            <VOUCHERTYPENAME>${escapeXml(v.voucher_type_name)}</VOUCHERTYPENAME>`);
    lines.push(`            <VOUCHERNUMBER>${escapeXml(v.voucher_number)}</VOUCHERNUMBER>`);
    if (v.reference_no) lines.push(`            <REFERENCE>${escapeXml(v.reference_no)}</REFERENCE>`);
    if (v.narration) lines.push(`            <NARRATION>${escapeXml(v.narration)}</NARRATION>`);

    for (const e of entries) {
      const isDebit = e.is_debit === 1;
      const signedAmount = isDebit ? -e.amount : e.amount;
      const amountMajor = fromMinorUnits(signedAmount);

      lines.push('            <ALLLEDGERENTRIES.LIST>');
      lines.push(`              <LEDGERNAME>${escapeXml(e.ledger_name)}</LEDGERNAME>`);
      lines.push(`              <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`);
      lines.push(`              <AMOUNT>${amountMajor}</AMOUNT>`);
      if (e.narration) lines.push(`              <NARRATION>${escapeXml(e.narration)}</NARRATION>`);
      lines.push('            </ALLLEDGERENTRIES.LIST>');
    }

    lines.push('          </VOUCHER>');
    lines.push('        </TALLYMESSAGE>');
  }

  lines.push('      </REQUESTDATA>');
  lines.push('    </IMPORTDATA>');
  lines.push('  </BODY>');
  lines.push('</ENVELOPE>');

  return lines.join('\n');
}
