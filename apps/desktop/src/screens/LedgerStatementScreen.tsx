import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  initialLedgerId?: string;
  onBack: () => void;
}

interface LedgerOption {
  id: string;
  name: string;
}

interface StatementLine {
  voucherId: string;
  voucherNumber: string;
  voucherTypeName: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  runningBalance: number;
  runningIsDebit: boolean;
}

interface StatementReport {
  ledger: { id: string; name: string };
  openingBalance: number;
  openingIsDebit: boolean;
  lines: StatementLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingIsDebit: boolean;
}

export function LedgerStatementScreen({ session, initialLedgerId, onBack }: Props) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>(initialLedgerId ?? '');
  const [report, setReport] = useState<StatementReport | null>(null);
  const [fromDate, setFromDate] = useState<string>(session.periodBegin);
  const [toDate, setToDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const lds = (await window.ledgerdesk.listLedgers()) as LedgerOption[];
        setLedgers(lds);
        if (!selectedLedgerId && lds.length > 0) {
          setSelectedLedgerId(lds[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [selectedLedgerId]);

  const loadStatement = async () => {
    if (!selectedLedgerId) return;
    try {
      const res = (await window.ledgerdesk.getLedgerStatement(selectedLedgerId, { fromDate, toDate })) as StatementReport;
      setReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLedgerId, fromDate, toDate]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Ledger Vouchers (Statement)</h2>
            <span className="muted">Company: {session.company.name}</span>
          </div>

          <div style={{ marginLeft: '1rem' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Select Ledger</label>
            <select
              value={selectedLedgerId}
              onChange={(e) => setSelectedLedgerId(e.target.value)}
              style={{ fontWeight: 600, fontSize: '14px' }}
            >
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button onClick={onBack} style={{ marginTop: '14px' }}>
            Back (Esc)
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem' }}>{error}</div>}

      <div style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem', width: '100px' }}>Date</th>
              <th style={{ padding: '0.5rem' }}>Particulars</th>
              <th style={{ padding: '0.5rem', width: '130px' }}>Vch Type</th>
              <th style={{ padding: '0.5rem', width: '90px' }}>Vch No.</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Debit (₹)</th>
              <th style={{ padding: '0.5rem', width: '130px', textAlign: 'right' }}>Credit (₹)</th>
              <th style={{ padding: '0.5rem', width: '140px', textAlign: 'right' }}>Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            {report && (
              <tr style={{ background: 'var(--bg-elevated)', fontStyle: 'italic', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.4rem 0.5rem' }}>{fromDate}</td>
                <td style={{ padding: '0.4rem 0.5rem' }} colSpan={3}>
                  Opening Balance
                </td>
                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                  {report.openingIsDebit ? `₹${(report.openingBalance / 100).toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                  {!report.openingIsDebit ? `₹${(report.openingBalance / 100).toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.openingBalance / 100).toFixed(2)} {report.openingIsDebit ? 'Dr' : 'Cr'}
                </td>
              </tr>
            )}

            {!report || report.lines.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No transactions recorded for this ledger in this date range.
                </td>
              </tr>
            ) : (
              report.lines.map((line, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{line.date}</td>
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{line.particulars}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{line.voucherTypeName}</td>
                  <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{line.voucherNumber}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {line.debit > 0 ? `₹${(line.debit / 100).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {line.credit > 0 ? `₹${(line.credit / 100).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    ₹{(line.runningBalance / 100).toFixed(2)} {line.runningIsDebit ? 'Dr' : 'Cr'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {report && (
            <tfoot>
              <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: '0.5rem' }} colSpan={4}>
                  Closing Balance: ₹{(report.closingBalance / 100).toFixed(2)} {report.closingIsDebit ? 'Dr' : 'Cr'}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalDebit / 100).toFixed(2)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalCredit / 100).toFixed(2)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.closingBalance / 100).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
