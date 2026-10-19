import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onDrillDown: (ledgerId: string) => void;
}

interface TrialBalanceRow {
  id: string;
  name: string;
  parentName?: string;
  nature: string;
  openingDebit: number;
  openingCredit: number;
  transactionDebit: number;
  transactionCredit: number;
  closingDebit: number;
  closingCredit: number;
}

interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalTransactionDebit: number;
  totalTransactionCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
  difference: number;
}

export function TrialBalanceScreen({ session, onBack, onDrillDown }: Props) {
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [asOfDate, setAsOfDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = (await window.ledgerdesk.getTrialBalance(asOfDate)) as TrialBalanceReport;
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
        id: 'drill',
        label: 'Drill-Down (Enter)',
        chord: { kind: 'key' as const, key: 'Enter' },
        buttonBar: true,
        run: () => {
          if (report && report.rows[selectedIndex]) {
            onDrillDown(report.rows[selectedIndex].id);
          }
        },
      },
      {
        id: 'back',
        label: 'Back (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onBack,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, selectedIndex, onBack, onDrillDown],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Trial Balance</h2>
          <span className="muted">
            Company: {session.company.name} | As of: {asOfDate}
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

      {/* Balance Verification Banner */}
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
              <span style={{ color: '#10b981' }}>✓ Perfectly Balanced (Debit == Credit)</span>
            ) : (
              <span style={{ color: '#f87171' }}>
                ⚠ Out of Balance! Difference: ₹{(Math.abs(report.difference) / 100).toFixed(2)}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>
            Closing Dr: ₹{(report.totalClosingDebit / 100).toFixed(2)} | Closing Cr: ₹
            {(report.totalClosingCredit / 100).toFixed(2)}
          </div>
        </div>
      )}

      {/* Trial Balance Table */}
      <div style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Particulars</th>
              <th style={{ padding: '0.5rem' }}>Group</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Opening (₹)</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Debit (₹)</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Credit (₹)</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Closing (₹)</th>
            </tr>
          </thead>
          <tbody>
            {!report || report.rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading Trial Balance...
                </td>
              </tr>
            ) : (
              report.rows.map((row, idx) => {
                const isSelected = idx === selectedIndex;
                const opStr =
                  row.openingDebit > 0
                    ? `₹${(row.openingDebit / 100).toFixed(2)} Dr`
                    : row.openingCredit > 0
                      ? `₹${(row.openingCredit / 100).toFixed(2)} Cr`
                      : '0.00';

                const clStr =
                  row.closingDebit > 0
                    ? `₹${(row.closingDebit / 100).toFixed(2)} Dr`
                    : row.closingCredit > 0
                      ? `₹${(row.closingCredit / 100).toFixed(2)} Cr`
                      : '0.00';

                return (
                  <tr
                    key={row.id}
                    onClick={() => {
                      setSelectedIndex(idx);
                      onDrillDown(row.id);
                    }}
                    style={{
                      background: isSelected ? 'var(--accent-dim)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{row.parentName}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{opStr}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.transactionDebit > 0 ? `₹${(row.transactionDebit / 100).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {row.transactionCredit > 0 ? `₹${(row.transactionCredit / 100).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {clStr}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {report && (
            <tfoot>
              <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: '0.5rem' }} colSpan={2}>
                  Total
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalOpeningDebit / 100).toFixed(2)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalTransactionDebit / 100).toFixed(2)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalTransactionCredit / 100).toFixed(2)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalClosingDebit / 100).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
