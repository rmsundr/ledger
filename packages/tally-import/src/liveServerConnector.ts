import {
  buildCompanyListRequest,
  buildDayBookExportRequest,
  buildMastersExportRequest,
  fetchTallyData,
  type TallyServerConfig,
} from './serverImport.js';

export type { TallyServerCompany, TallyServerConfig } from './serverImport.js';
export { parseCompanyList } from './serverImport.js';

/** The name the rest of the app has always used for the server settings. */
export type LiveServerConfig = TallyServerConfig;

export interface TallyServerFetchResult {
  ok: boolean;
  data?: string;
  error?: string;
}

/**
 * Fetch a Tally XML server response as a string.
 *
 * Kept for callers that need the raw XML. The importer should prefer
 * `fetchTallyData`, which streams the response through the parser instead
 * of buffering it.
 */
export async function fetchFromTallyServer(
  xmlRequest: string,
  config?: LiveServerConfig,
): Promise<TallyServerFetchResult> {
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

export {
  buildCompanyListRequest,
  buildDayBookExportRequest,
  buildMastersExportRequest,
  fetchTallyData,
};
