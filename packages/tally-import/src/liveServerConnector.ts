export interface LiveServerConfig {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export async function fetchFromTallyServer(
  xmlRequest: string,
  config?: LiveServerConfig,
): Promise<{ ok: boolean; data?: string; error?: string }> {
  const host = config?.host ?? '127.0.0.1';
  const port = config?.port ?? 9000;
  const timeoutMs = config?.timeoutMs ?? 10000;
  const url = `http://${host}:${port}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
      },
      body: xmlRequest,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const text = await response.text();
    return { ok: true, data: text };
  } catch (err) {
    return {
      ok: false,
      error: `Could not connect to Tally server at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
  `.trim();
}

export function buildMastersExportRequest(): string {
  return `
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>All Masters</REPORTNAME>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
  `.trim();
}
