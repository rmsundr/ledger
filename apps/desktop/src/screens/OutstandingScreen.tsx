import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
}

interface BillOutstandingItem {
  party_ledger_id: string;
  party_name: string;
  ref_name: string;
  ref_type: string;
  due_date: string | null;
  bill_date: string;
  original_amount: number;
  cleared_amount: number;
  pending_amount: number;
  is_debit: number;
  overdue_days: number;
}

interface AgeingBucket {
  party_name: string;
  total_pending: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
}

export function OutstandingScreen({ session, onBack }: Props) {
  const [isReceivable, setIsReceivable] = useState(true);
  const [bills, setBills] = useState<BillOutstandingItem[]>([]);
  const [ageing, setAgeing] = useState<AgeingBucket[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>(session.currentDate);
  const [viewMode, setViewMode] = useState<'bills' | 'ageing'>('bills');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      if (isReceivable) {
        const b = (await window.ledgerdesk.listBillsReceivable(asOfDate)) as BillOutstandingItem[];
        setBills(b);
      } else {
        const b = (await window.ledgerdesk.listBillsPayable(asOfDate)) as BillOutstandingItem[];
        setBills(b);
      }
      const a = (await window.ledgerdesk.getAgeingAnalysis(asOfDate, isReceivable)) as AgeingBucket[];
      setAgeing(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReceivable, asOfDate]);

  const totalOutstanding = useMemo(() => {
    return bills.reduce((acc, b) => acc + b.pending_amount, 0);
  }, [bills]);

  const actions = useMemo(
    () => [
      {
        id: 'toggle',
        label: isReceivable ? 'Show Payables' : 'Show Receivables',
        chord: { kind: 'key' as const, key: 'Tab' },
        buttonBar: true,
        run: () => setIsReceivable((prev) => !prev),
      },
      {
        id: 'back',
        label: 'Back (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onBack,
      },
    ],
    [isReceivable, onBack],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>{isReceivable ? 'Bills Receivable (Debtors)' : 'Bills Payable (Creditors)'}</h2>
          <span className="muted">
            Company: {session.company.name} | Total Pending: ₹{(totalOutstanding / 100).toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
            <button
              className={viewMode === 'bills' ? 'primary' : ''}
              onClick={() => setViewMode('bills')}
              style={{ borderRadius: 0 }}
            >
              Bill List
            </button>
            <button
              className={viewMode === 'ageing' ? 'primary' : ''}
              onClick={() => setViewMode('ageing')}
              style={{ borderRadius: 0 }}
            >
              Ageing Analysis
            </button>
          </div>

          <div>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>

          <button onClick={() => setIsReceivable(!isReceivable)}>Switch to {isReceivable ? 'Payables' : 'Receivables'}</button>
          <button onClick={onBack}>Back (Esc)</button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem' }}>{error}</div>}

      <div style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflowY: 'auto' }}>
        {viewMode === 'bills' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Date</th>
                <th style={{ padding: '0.5rem' }}>Party Name</th>
                <th style={{ padding: '0.5rem' }}>Ref Name</th>
                <th style={{ padding: '0.5rem' }}>Due Date</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Original (₹)</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Cleared (₹)</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Pending (₹)</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Overdue Days</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No outstanding bills found.
                  </td>
                </tr>
              ) : (
                bills.map((b, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{b.bill_date}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{b.party_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{b.ref_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{b.due_date ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{(b.original_amount / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{(b.cleared_amount / 100).toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.4rem 0.5rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: b.overdue_days > 0 ? '#f87171' : 'inherit',
                      }}
                    >
                      ₹{(b.pending_amount / 100).toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.4rem 0.5rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: b.overdue_days > 0 ? '#f87171' : 'var(--text-muted)',
                      }}
                    >
                      {b.overdue_days > 0 ? `${b.overdue_days} days` : 'Current'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Party Name</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total (₹)</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>0–30 Days</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>31–60 Days</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>61–90 Days</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>&gt; 90 Days</th>
              </tr>
            </thead>
            <tbody>
              {ageing.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No pending amounts to age.
                  </td>
                </tr>
              ) : (
                ageing.map((a, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{a.party_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      ₹{(a.total_pending / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {a.bucket_0_30 > 0 ? `₹${(a.bucket_0_30 / 100).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {a.bucket_31_60 > 0 ? `₹${(a.bucket_31_60 / 100).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {a.bucket_61_90 > 0 ? `₹${(a.bucket_61_90 / 100).toFixed(2)}` : '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.4rem 0.5rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: a.bucket_over_90 > 0 ? '#f87171' : 'inherit',
                      }}
                    >
                      {a.bucket_over_90 > 0 ? `₹${(a.bucket_over_90 / 100).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
