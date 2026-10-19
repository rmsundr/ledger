import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
}

interface StockRow {
  itemId: string;
  itemName: string;
  groupName: string;
  unitSymbol: string;
  openingQty: number;
  openingRate: number;
  openingVal: number;
  inwardQty: number;
  inwardVal: number;
  outwardQty: number;
  outwardVal: number;
  closingQty: number;
  closingRate: number;
  closingVal: number;
}

interface StockSummaryReport {
  rows: StockRow[];
  totalOpeningValue: number;
  totalInwardValue: number;
  totalOutwardValue: number;
  totalClosingValue: number;
}

export function StockSummaryScreen({ session, onBack }: Props) {
  const [report, setReport] = useState<StockSummaryReport | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(session.currentDate);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemName, setItemName] = useState('');
  const [openingQty, setOpeningQty] = useState('0');
  const [openingRate, setOpeningRate] = useState('0');

  const loadData = async () => {
    try {
      const res = (await window.ledgerdesk.getStockSummary(asOfDate)) as StockSummaryReport;
      setReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate]);

  const createItem = async () => {
    try {
      const units = (await window.ledgerdesk.listUnits()) as { id: string }[];
      let unitId = units[0]?.id;
      if (!unitId) {
        const u = (await window.ledgerdesk.createUnit({ symbol: 'Nos', formalName: 'Numbers' })) as { id: string };
        unitId = u.id;
      }

      const q = parseFloat(openingQty) || 0;
      const r = Math.round((parseFloat(openingRate) || 0) * 100);

      await window.ledgerdesk.createStockItem({
        name: itemName.trim(),
        unitId,
        openingQuantity: q,
        openingRate: r,
        openingValue: Math.round(q * r),
      });

      setShowCreateModal(false);
      setItemName('');
      setOpeningQty('0');
      setOpeningRate('0');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'create',
        label: 'Create Item (Alt+C)',
        chord: { kind: 'key' as const, key: 'c', alt: true },
        buttonBar: true,
        run: () => setShowCreateModal(true),
      },
      {
        id: 'back',
        label: 'Back (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: () => {
          if (showCreateModal) setShowCreateModal(false);
          else onBack();
        },
      },
    ],
    [showCreateModal, onBack],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Stock Summary</h2>
          <span className="muted">
            Company: {session.company.name} | As of: {asOfDate}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>As on Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button className="primary" onClick={() => setShowCreateModal(true)} style={{ marginTop: '14px' }}>
            Create Stock Item (Alt+C)
          </button>
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
              <th style={{ padding: '0.5rem' }}>Item Name</th>
              <th style={{ padding: '0.5rem' }}>Group</th>
              <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Opening Qty</th>
              <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Inwards</th>
              <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Outwards</th>
              <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Closing Qty</th>
              <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Rate (₹)</th>
              <th style={{ padding: '0.5rem', width: '140px', textAlign: 'right' }}>Closing Value (₹)</th>
            </tr>
          </thead>
          <tbody>
            {!report || report.rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No inventory items recorded. Press Alt+C to create a stock item.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.itemId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{row.itemName}</td>
                  <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{row.groupName}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {row.openingQty} {row.unitSymbol}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {row.inwardQty} {row.unitSymbol}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {row.outwardQty} {row.unitSymbol}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {row.closingQty} {row.unitSymbol}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    ₹{(row.closingRate / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    ₹{(row.closingVal / 100).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {report && (
            <tfoot>
              <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: '0.5rem' }} colSpan={7}>
                  Total Stock Value
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{(report.totalClosingValue / 100).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '1.5rem', width: '400px' }}>
            <h3 style={{ marginTop: 0 }}>Create Stock Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Item Name *</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Opening Qty</label>
                  <input
                    type="number"
                    value={openingQty}
                    onChange={(e) => setOpeningQty(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Opening Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingRate}
                    onChange={(e) => setOpeningRate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={() => setShowCreateModal(false)}>Cancel (Esc)</button>
                <button className="primary" onClick={() => void createItem()}>
                  Save Item (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
