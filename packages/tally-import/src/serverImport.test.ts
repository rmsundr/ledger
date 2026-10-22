import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCompanyListRequest,
  buildDayBookExportRequest,
  buildMastersExportRequest,
  fetchTallyData,
  parseCompanyList,
  TallyServerError,
} from './serverImport.js';

describe('Tally XML server requests', () => {
  it('asks Tally for the list of companies', () => {
    const req = buildCompanyListRequest();
    expect(req).toContain('<TALLYREQUEST>Export Data</TALLYREQUEST>');
    expect(req).toContain('<REPORTNAME>List of Companies</REPORTNAME>');
  });

  it('asks Tally for all masters, optionally scoped to a company', () => {
    expect(buildMastersExportRequest()).toContain('<REPORTNAME>All Masters</REPORTNAME>');

    const scoped = buildMastersExportRequest('KRLconsolidates');
    expect(scoped).toContain('<SVCURRENTCOMPANY>KRLconsolidates</SVCURRENTCOMPANY>');
  });

  it('asks Tally for a day book over a date range', () => {
    const req = buildDayBookExportRequest('KRLconsolidates', '2023-04-01', '2024-03-31');
    expect(req).toContain('<REPORTNAME>Day Book</REPORTNAME>');
    expect(req).toContain('<SVCURRENTCOMPANY>KRLconsolidates</SVCURRENTCOMPANY>');
    expect(req).toContain('<SVFROMDATE>2023-04-01</SVFROMDATE>');
    expect(req).toContain('<SVTODATE>2024-03-31</SVTODATE>');
  });

  it('escapes characters that would break the request XML', () => {
    const req = buildDayBookExportRequest('A & B <Ltd>', '2023-04-01', '2024-03-31');
    expect(req).toContain('A &amp; B &lt;Ltd&gt;');
    expect(req).not.toContain('<SVCURRENTCOMPANY>A & B <Ltd></SVCURRENTCOMPANY>');
  });
});

describe('Parsing the company list', () => {
  it('reads companies from a COMPANYNAME element', () => {
    const xml = `
      <ENVELOPE><BODY><EXPORTDATA><REQUESTDATA>
        <TALLYMESSAGE><COMPANYNAME>KRLconsolidates</COMPANYNAME></TALLYMESSAGE>
        <TALLYMESSAGE><COMPANYNAME>Second Co</COMPANYNAME></TALLYMESSAGE>
      </REQUESTDATA></EXPORTDATA></BODY></ENVELOPE>
    `;
    const companies = parseCompanyList(xml);
    expect(companies.map((c) => c.name)).toEqual(['KRLconsolidates', 'Second Co']);
  });

  it('reads companies from a COMPANY NAME attribute', () => {
    const xml = `<TALLYMESSAGE><COMPANY NAME="Alpha Ltd" COMPANYID="10000"/></TALLYMESSAGE>`;
    const companies = parseCompanyList(xml);
    expect(companies).toEqual([{ name: 'Alpha Ltd' }]);
  });

  it('does not report the same company twice', () => {
    const xml = `
      <COMPANYNAME>KRL</COMPANYNAME>
      <COMPANY NAME="KRL"/>
      <COMPANYNAME>krl</COMPANYNAME>
    `;
    expect(parseCompanyList(xml)).toHaveLength(1);
  });

  it('decodes XML entities in company names', () => {
    const xml = `<COMPANYNAME>Smith &amp; Sons &lt;Pvt&gt;</COMPANYNAME>`;
    expect(parseCompanyList(xml)[0].name).toBe('Smith & Sons <Pvt>');
  });
});

/** A Tally export with one voucher, served in chunks to mimic Tally's output. */
const SERVER_VOUCHER_XML = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>20230405</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>RCT-1</VOUCHERNUMBER>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Metro Traders</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>500.00</AMOUNT>
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
`;

const servers: http.Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** Start a stand-in for the Tally XML server and return its port. */
async function startServer(handler: http.RequestListener): Promise<number> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

describe('Fetching data from the Tally XML server', () => {
  it('parses a voucher streamed back by the server', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      // Write in pieces so the client has to reassemble them.
      res.write(SERVER_VOUCHER_XML.slice(0, 200));
      res.end(SERVER_VOUCHER_XML.slice(200));
    });

    const data = await fetchTallyData(buildDayBookExportRequest('KRL', '2023-04-01', '2024-03-31'), {
      host: '127.0.0.1',
      port,
    });

    expect(data.vouchers).toHaveLength(1);
    expect(data.vouchers[0].voucherNumber).toBe('RCT-1');
    expect(data.vouchers[0].voucherType).toBe('Receipt');
    expect(data.vouchers[0].entries).toHaveLength(2);
  });

  it('sends the request body to the server', async () => {
    let received = '';
    const port = await startServer((req, res) => {
      req.on('data', (chunk) => {
        received += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<ENVELOPE/>');
      });
    });

    await fetchTallyData(buildMastersExportRequest('KRL'), { host: '127.0.0.1', port });

    expect(received).toContain('<TALLYREQUEST>Export Data</TALLYREQUEST>');
    expect(received).toContain('<REPORTNAME>All Masters</REPORTNAME>');
  });

  it('explains how to start the Tally server when nothing is listening', async () => {
    // Port 1 is reserved and nothing will be listening on it.
    await expect(
      fetchTallyData(buildMastersExportRequest(), { host: '127.0.0.1', port: 1, timeoutMs: 3000 }),
    ).rejects.toThrow(TallyServerError);

    await expect(
      fetchTallyData(buildMastersExportRequest(), { host: '127.0.0.1', port: 1, timeoutMs: 3000 }),
    ).rejects.toThrow(/Tally acts as/);
  });

  it('reports a non-200 response from the server', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(500);
      res.end('boom');
    });

    await expect(
      fetchTallyData(buildMastersExportRequest(), { host: '127.0.0.1', port }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
