import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onDrillDown: (ledgerId: string) => void;
}

interface PnLLine {
  ledgerId: string;
  name: string;
  groupName: string;
  amount: number;
}

interface ProfitAndLossReport {
  salesAccounts: PnLLine[];
  directIncomes: PnLLine[];
  totalDirectIncome: number;
  purchaseAccounts: PnLLine[];
  directExpenses: PnLLine[];
  totalDirectExpense: number;
  grossProfit: number;
  grossLoss: number;
  indirectIncomes: PnLLine[];
  totalIndirectIncome: number;
  indirectExpenses: PnLLine[];
  totalIndirectExpense: number;
  netProfit: number;
  netLoss: number;
}

export function ProfitLossScreen({ session, onBack, onDrillDown }: Props) {
  const [report, setReport] = useState<ProfitAndLossReport | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = (await window.ledgerdesk.getProfitAndLoss(asOfDate)) as ProfitAndLossReport;
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
          <h2 style={{ margin: 0 }}>Profit & Loss Account</h2>
          <span className="muted">
            Company: {session.company.name} | Period: {session.periodBegin} to {asOfDate}
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

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', overflowY: 'auto' }}>
        {/* Left Pane: Expenses */}
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Trading & Operating Expenses
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>Purchase Accounts</div>
            {report?.purchaseAccounts.map((l) => (
              <div
                key={l.ledgerId}
                onClick={() => onDrillDown(l.ledgerId)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
              >
                <span>{l.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>Direct Expenses</div>
            {report?.directExpenses.map((l) => (
              <div
                key={l.ledgerId}
                onClick={() => onDrillDown(l.ledgerId)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
              >
                <span>{l.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {report && report.grossProfit > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontWeight: 700,
                color: '#10b981',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span>Gross Profit c/d</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(report.grossProfit / 100).toFixed(2)}</span>
            </div>
          )}

          <h3 style={{ margin: '1.5rem 0 0.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Indirect Expenses
          </h3>

          {report?.indirectExpenses.map((l) => (
            <div
              key={l.ledgerId}
              onClick={() => onDrillDown(l.ledgerId)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
            >
              <span>{l.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
            </div>
          ))}

          {report && report.netProfit > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                marginTop: '1rem',
                fontWeight: 700,
                color: '#10b981',
                borderTop: '2px solid var(--border)',
              }}
            >
              <span>Nett Profit</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(report.netProfit / 100).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Right Pane: Incomes */}
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Trading & Operating Incomes
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>Sales Accounts</div>
            {report?.salesAccounts.map((l) => (
              <div
                key={l.ledgerId}
                onClick={() => onDrillDown(l.ledgerId)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
              >
                <span>{l.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>Direct Incomes</div>
            {report?.directIncomes.map((l) => (
              <div
                key={l.ledgerId}
                onClick={() => onDrillDown(l.ledgerId)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
              >
                <span>{l.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {report && report.grossProfit > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontWeight: 700,
                color: '#10b981',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span>Gross Profit b/d</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(report.grossProfit / 100).toFixed(2)}</span>
            </div>
          )}

          <h3 style={{ margin: '1.5rem 0 0.5rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
            Indirect Incomes
          </h3>

          {report?.indirectIncomes.map((l) => (
            <div
              key={l.ledgerId}
              onClick={() => onDrillDown(l.ledgerId)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: 'pointer' }}
            >
              <span>{l.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(l.amount / 100).toFixed(2)}</span>
            </div>
          ))}

          {report && report.netLoss > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                marginTop: '1rem',
                fontWeight: 700,
                color: '#f87171',
                borderTop: '2px solid var(--border)',
              }}
            >
              <span>Nett Loss</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(report.netLoss / 100).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
