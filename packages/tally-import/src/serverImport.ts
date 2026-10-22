import { createTallyParser } from './xmlParser.js';
import type { TallyImportData } from './types.js';

export interface TallyServerConfig {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export interface TallyServerCompany {
  name: string;
  /** Tally's internal company number (the 5-digit folder). */
  number?: string;
}

export class TallyServerError extends Error {}

/**
 * Ask the Tally XML server for a request, streaming the response back.
 *
 * The response can be very large — a year of Day Book vouchers for a busy
 * company runs to tens of megabytes — so it is piped through the
 * incremental SAX parser rather than read into a string.
 */
export async function fetchTallyData(
  xmlRequest: string,
  config?: TallyServerConfig,
): Promise<TallyImportData> {
  const host = config?.host ?? '127.0.0.1';
  const port = config?.port ?? 9000;
  const timeoutMs = config?.timeoutMs ?? 120000;
  const url = `http://${host}:${port}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=utf-8' },
      body: xmlRequest,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : String(err);
    throw new TallyServerError(
      `Could not connect to the Tally XML server at ${url}: ${reason}. ` +
        `In Tally press F12 (Configuration) -> Advanced Configurations -> "Tally acts as" and set it to "Both" or "Server", then make sure the company is open.`,
    );
  }

  try {
    if (!response.ok) {
      throw new TallyServerError(`Tally server returned HTTP ${response.status}: ${response.statusText}`);
    }

    const body = response.body;
    if (!body) {
      // Some environments give no streaming body; fall back to text.
      const text = await response.text();
      const parser = createTallyParser();
      parser.write(text);
      parser.close();
      return parser.result();
    }

    const parser = createTallyParser();
    const decoder = new TextDecoder('utf-8');
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.write(decoder.decode(value, { stream: true }));
    }
    parser.write(decoder.decode());
    parser.close();
    return parser.result();
  } finally {
    clearTimeout(timer);
  }
}

/** Request the list of companies the running Tally instance can serve. */
export function buildCompanyListRequest(): string {
  return `
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>List of Companies</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>All Companies</SVCURRENTCOMPANY>
            </STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
  `.trim();
}

/** Request every master (groups, ledgers, stock items, godowns, ...). */
export function buildMastersExportRequest(companyName?: string): string {
  const current = companyName
    ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  return `
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>All Masters</REPORTNAME>
            <STATICVARIABLES>${current}</STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
  `.trim();
}

/**
 * Request the vouchers (Day Book) for a company over a date range.
 *
 * The Day Book report is the same structure as a Gateway of Tally -> Export
 * -> Data -> XML "Day Book" file, so the existing parser reads it unchanged.
 */
export function buildDayBookExportRequest(
  companyName: string,
  fromDate: string,
  toDate: string,
): string {
  return `
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Day Book</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
              <SVFROMDATE>${escapeXml(fromDate)}</SVFROMDATE>
              <SVTODATE>${escapeXml(toDate)}</SVTODATE>
              <SVEXPORTFORMAT>XML</SVEXPORTFORMAT>
              <SVINCLUDETRACKINGNO>Yes</SVINCLUDETRACKINGNO>
            </STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
  `.trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pull the company names out of a "List of Companies" response.
 *
 * Tally has used a couple of shapes for this over the years, so both are
 * accepted: a `<COMPANYNAME>` element and a `<COMPANY NAME="...">` element.
 */
export function parseCompanyList(xml: string): TallyServerCompany[] {
  const companies: TallyServerCompany[] = [];
  const seen = new Set<string>();

  const nameTag = /<COMPANYNAME>\s*([^<]*?)\s*<\/COMPANYNAME>/gi;
  for (const match of xml.matchAll(nameTag)) {
    const name = decodeXmlEntities(match[1]);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      companies.push({ name });
    }
  }

  const companyTag = /<COMPANY\b[^>]*\bNAME\s*=\s*"([^"]*)"/gi;
  for (const match of xml.matchAll(companyTag)) {
    const name = decodeXmlEntities(match[1]);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      companies.push({ name });
    }
  }

  return companies;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
