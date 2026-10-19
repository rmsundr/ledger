import { useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onImportDone: () => void;
}

interface ImportResult {
  groupsImported: number;
  ledgersImported: number;
  vouchersImported: number;
  vouchersSkipped: number;
  errors: string[];
  reconciliation: {
    totalClosingDebit: number;
    totalClosingCredit: number;
    difference: number;
    isBalanced: boolean;
  };
}

export function TallyImportScreen({ session, onBack, onImportDone }: Props) {
  const [tab, setTab] = useState<'import' | 'export' | 'native'>('import');
  const [xmlContent, setXmlContent] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exportedXml, setExportedXml] = useState<string>('');
  const [nativePath, setNativePath] = useState('');
  const [nativeGuidance, setNativeGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = async () => {
    if (!xmlContent.trim()) {
      setError('Please paste or load Tally XML data.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = (await window.ledgerdesk.importTallyXml(xmlContent)) as ImportResult;
      setResult(res);
      onImportDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const doExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const xml = await window.ledgerdesk.exportTallyXml();
      setExportedXml(xml);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const checkNativePath = async () => {
    if (!nativePath.trim()) return;
    try {
      const res = (await window.ledgerdesk.detectTallyPath(nativePath.trim())) as {
        kind: string;
        guidance: string;
      };
      setNativeGuidance(res.guidance);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'back',
        label: 'Back (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onBack,
      },
    ],
    [onBack],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Import / Export from Tally ERP 9</h2>
          <span className="muted">Company: {session.company.name}</span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={tab === 'import' ? 'primary' : ''} onClick={() => setTab('import')}>
            1. Import Tally XML
          </button>
          <button className={tab === 'export' ? 'primary' : ''} onClick={() => setTab('export')}>
            2. Export to Tally XML
          </button>
          <button className={tab === 'native' ? 'primary' : ''} onClick={() => setTab('native')}>
            3. Native Backup (.900)
          </button>
          <button onClick={onBack}>Back (Esc)</button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem' }}>{error}</div>}

      <div style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '1rem', overflowY: 'auto' }}>
        {tab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
            <div>
              <strong>Paste Tally XML Content</strong>
              <p style={{ margin: '4px 0 8px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Exported from Tally ERP 9 via: <em>Gateway of Tally &gt; Export &gt; Data &gt; XML</em>.
              </p>
              <textarea
                value={xmlContent}
                onChange={(e) => setXmlContent(e.target.value)}
                placeholder="<ENVELOPE>...<TALLYMESSAGE>...</ENVELOPE>"
                style={{ width: '100%', height: '180px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button className="primary" disabled={loading} onClick={() => void doImport()}>
                {loading ? 'Importing Data...' : 'Import Into LedgerDesk'}
              </button>
            </div>

            {result && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Import Reconciliation Report</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '0.5rem' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Groups Created</span>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{result.groupsImported}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '0.5rem' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ledgers Created</span>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{result.ledgersImported}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '0.5rem' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vouchers Imported</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{result.vouchersImported}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '0.5rem' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vouchers Skipped</span>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{result.vouchersSkipped}</div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.5rem',
                    background: result.reconciliation.isBalanced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${result.reconciliation.isBalanced ? '#10b981' : '#ef4444'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    <strong>Trial Balance: </strong>
                    {result.reconciliation.isBalanced ? '✓ Reconciled & Balanced' : '⚠ Out of balance'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    Total Dr: ₹{(result.reconciliation.totalClosingDebit / 100).toFixed(2)} | Total Cr: ₹
                    {(result.reconciliation.totalClosingCredit / 100).toFixed(2)}
                  </span>
                </div>

                {result.errors.length > 0 && (
                  <div style={{ marginTop: '0.75rem', fontSize: '12px', color: '#f87171' }}>
                    <strong>Notices:</strong>
                    <ul>
                      {result.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'export' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
            <div>
              <strong>Export Company Data to Tally XML Format</strong>
              <p style={{ margin: '4px 0 8px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Generates complete Masters and Vouchers in standard Tally XML envelope format for round-trip import into Tally ERP 9.
              </p>
              <button className="primary" disabled={loading} onClick={() => void doExport()}>
                {loading ? 'Generating XML...' : 'Generate Tally XML Export'}
              </button>
            </div>

            {exportedXml && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Exported Tally XML:</label>
                <textarea
                  readOnly
                  value={exportedXml}
                  style={{ flex: 1, width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'native' && (
          <div style={{ maxWidth: '640px' }}>
            <h3 style={{ marginTop: 0 }}>Native Tally Backup File (.900) or Company Folder</h3>
            <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
              Tally native backups (<code>.900</code>, <code>Tally.imp</code>) and company folders (e.g. <code>10000</code>)
              use proprietary binary formats with version-specific encryption. Select or enter the path below to detect the format:
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="/path/to/TBK900.001.900 or /path/to/data/10000"
                value={nativePath}
                onChange={(e) => setNativePath(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="primary" onClick={() => void checkNativePath()}>
                Inspect Path
              </button>
            </div>

            {nativeGuidance && (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  padding: '1rem',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                <strong>Inspection Result & Next Steps:</strong>
                <p style={{ margin: '0.5rem 0 0 0' }}>{nativeGuidance}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
