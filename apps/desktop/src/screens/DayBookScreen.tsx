import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onNewVoucher: () => void;
}

interface DayBookEntry {
  voucherId: string;
  voucherNumber: string;
  voucherTypeName: string;
  date: string;
  partyLedger: string;
  amount: number;
  narration: string;
  isCancelled: boolean;
}

export function DayBookScreen({ session, onBack, onNewVoucher }: Props) {
  const [entries, setEntries] = useState<DayBookEntry[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [fromDate, setFromDate] = useState<string>(session.periodBegin);
  const [toDate, setToDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = (await window.ledgerdesk.getDayBook({ fromDate, toDate })) as {
        entries: DayBookEntry[];
        totalAmount: number;
      };
      setEntries(res.entries);
      setTotalAmount(res.totalAmount);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const cancelCurrent = async () => {
    const current = entries[selectedIndex];
    if (!current || current.isCancelled) return;
    if (confirm(`Cancel voucher #${current.voucherNumber} (${current.voucherTypeName})?`)) {
      try {
        await window.ledgerdesk.cancelVoucher(current.voucherId);
        await loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'new',
        label: 'New Vch (Alt+A)',
        chord: { kind: 'key' as const, key: 'a', alt: true },
        buttonBar: true,
        run: onNewVoucher,
      },
      {
        id: 'cancel',
        label: 'Cancel Vch (Alt+X)',
        chord: { kind: 'key' as const, key: 'x', alt: true },
        buttonBar: true,
        run: () => void cancelCurrent(),
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
    [entries, selectedIndex, onBack, onNewVoucher],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Day Book</h2>
          <span className="muted">
            Company: {session.company.name} | Period: {fromDate} to {toDate}
          </span>
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
          <button className="primary" onClick={onNewVoucher} style={{ marginTop: '14px' }}>
            New Voucher (Alt+A)
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
              <th style={{ padding: '0.5rem', width: '100px' }}>Vch No.</th>
              <th style={{ padding: '0.5rem', width: '150px', textAlign: 'right' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No vouchers recorded in this date range. Press Alt+A to enter a voucher.
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => {
                const isSelected = idx === selectedIndex;
                const formatted = (entry.amount / 100).toFixed(2);

                return (
                  <tr
                    key={entry.voucherId}
                    onClick={() => setSelectedIndex(idx)}
                    style={{
                      background: isSelected ? 'var(--accent-dim)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      opacity: entry.isCancelled ? 0.5 : 1,
                    }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem' }}>{entry.date}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>
                      {entry.partyLedger}
                      {entry.isCancelled && <span style={{ color: '#f87171', marginLeft: '6px' }}>[CANCELLED]</span>}
                      {entry.narration && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                          {entry.narration}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{entry.voucherTypeName}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{entry.voucherNumber}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{formatted}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          padding: '0.5rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>Total Vouchers: {entries.length}</span>
        <strong>Total Amount: ₹{(totalAmount / 100).toFixed(2)}</strong>
      </div>
    </div>
  );
}
