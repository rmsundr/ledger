import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onDrillDown: (ledgerId: string) => void;
}

interface BalanceSheetGroup {
  groupName: string;
  amount: number;
  ledgers: { ledgerId: string; name: string; amount: number }[];
}

interface BalanceSheetReport {
  liabilities: BalanceSheetGroup[];
  totalLiabilities: number;
  assets: BalanceSheetGroup[];
  totalAssets: number;
  netProfit: number;
  netLoss: number;
  difference: number;
  isBalanced: boolean;
}

export function BalanceSheetScreen({ session, onBack, onDrillDown }: Props) {
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = (await window.ledgerdesk.getBalanceSheet(asOfDate)) as BalanceSheetReport;
      setReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate]);

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
          <h2 style={{ margin: 0 }}>Balance Sheet</h2>
          <span className="muted">
            Company: {session.company.name} | As on: {asOfDate}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>As on Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button onClick={onBack} style={{ marginTop: '14px' }}>
            Back (Esc)
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem' }}>{error}</div>}

      {/* Reconciliation Banner */}
      {report && (
        <div
          style={{
            padding: '0.5rem 1rem',
            background: report.isBalanced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
            border: `1px solid ${report.isBalanced ? '#10b981' : '#ef4444'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
          }}
        >
          <div>
            <strong>Status: </strong>
            {report.isBalanced ? (
              <span style={{ color: '#10b981' }}>✓ Balance Sheet Matches (Assets == Liabilities + Net Profit)</span>
            ) : (
              <span style={{ color: '#f87171' }}>
                ⚠ Difference in Opening/Transactions: ₹{(Math.abs(report.difference) / 100).toFixed(2)}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>
            Liabilities: ₹{(report.totalLiabilities / 100).toFixed(2)} | Assets: ₹{(report.totalAssets / 100).toFixed(2)}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', overflowY: 'auto' }}>
        {/* Left Column: Liabilities */}
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Liabilities
          </h3>

          {report?.liabilities.map((g) => (
            <div key={g.groupName} style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: 'var(--text-bright)',
                }}
              >
                <span>{g.groupName}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(g.amount / 100).toFixed(2)}</span>
              </div>
              <div style={{ paddingLeft: '1rem', marginTop: '2px' }}>
                {g.ledgers.map((l) => (
                  <div
                    key={l.ledgerId}
                    onClick={() => onDrillDown(l.ledgerId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      padding: '1px 0',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{l.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {report && report.netProfit > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontWeight: 700,
                color: '#10b981',
                borderTop: '1px solid var(--border)',
                marginTop: '1rem',
              }}
            >
              <span>Profit & Loss A/c (Current Period Profit)</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(report.netProfit / 100).toFixed(2)}</span>
            </div>
          )}

          {report && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                marginTop: '1.5rem',
                fontWeight: 700,
                borderTop: '2px solid var(--border)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>Total Liabilities</span>
              <span>₹{(report.totalLiabilities / 100).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Right Column: Assets */}
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Assets
          </h3>

          {report?.assets.map((g) => (
            <div key={g.groupName} style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: 'var(--text-bright)',
                }}
              >
                <span>{g.groupName}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(g.amount / 100).toFixed(2)}</span>
              </div>
              <div style={{ paddingLeft: '1rem', marginTop: '2px' }}>
                {g.ledgers.map((l) => (
                  <div
                    key={l.ledgerId}
                    onClick={() => onDrillDown(l.ledgerId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      padding: '1px 0',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{l.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {report && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                marginTop: '1.5rem',
                fontWeight: 700,
                borderTop: '2px solid var(--border)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>Total Assets</span>
              <span>₹{(report.totalAssets / 100).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
