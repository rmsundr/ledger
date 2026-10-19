import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  initialType?: string;
  onSaved: () => void;
  onBack: () => void;
}

interface VoucherTypeItem {
  id: string;
  name: string;
}

interface LedgerOption {
  id: string;
  name: string;
  group_name: string;
}

interface EntryLine {
  isDebit: boolean;
  ledgerId: string;
  amountStr: string;
  narration: string;
}

export function VoucherEntryScreen({ session, initialType, onSaved, onBack }: Props) {
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeItem[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [selectedTypeName, setSelectedTypeName] = useState<string>('');
  const [voucherNumber, setVoucherNumber] = useState<string>('1');
  const [voucherDate, setVoucherDate] = useState<string>(session.currentDate);
  const [narration, setNarration] = useState<string>('');
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [lines, setLines] = useState<EntryLine[]>([
    { isDebit: true, ledgerId: '', amountStr: '', narration: '' },
    { isDebit: false, ledgerId: '', amountStr: '', narration: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [showQuickLedger, setShowQuickLedger] = useState(false);
  const [quickLedgerName, setQuickLedgerName] = useState('');
  const [quickGroupId, setQuickGroupId] = useState(session.groups[0]?.id ?? '');

  const loadInitialData = async () => {
    try {
      const vts = (await window.ledgerdesk.listVoucherTypes()) as VoucherTypeItem[];
      setVoucherTypes(vts);

      const target = initialType
        ? vts.find((v) => v.name.toLowerCase() === initialType.toLowerCase())
        : vts.find((v) => v.name === 'Payment');

      const activeVt = target ?? vts[0];
      if (activeVt) {
        setSelectedTypeId(activeVt.id);
        setSelectedTypeName(activeVt.name);
        const res = (await window.ledgerdesk.getNextVoucherNumber(activeVt.id)) as { number: string };
        setVoucherNumber(res.number || '1');
      }

      const lds = (await window.ledgerdesk.listLedgers()) as LedgerOption[];
      setLedgers(lds);
      if (lds.length >= 2) {
        setLines([
          { isDebit: true, ledgerId: lds[0].id, amountStr: '', narration: '' },
          { isDebit: false, ledgerId: lds[1].id, amountStr: '', narration: '' },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, []);

  const switchType = async (name: string) => {
    const vt = voucherTypes.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (!vt) return;
    setSelectedTypeId(vt.id);
    setSelectedTypeName(vt.name);
    try {
      const res = (await window.ledgerdesk.getNextVoucherNumber(vt.id)) as { number: string };
      setVoucherNumber(res.number || '1');
    } catch {
      // fallback
    }
  };

  const updateLine = (index: number, patch: Partial<EntryLine>) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { isDebit: prev[prev.length - 1]?.isDebit ? false : true, ledgerId: ledgers[0]?.id ?? '', amountStr: '', narration: '' },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Compute live Debit/Credit totals
  const { totalDr, totalCr, diff, isBalanced } = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      const amt = Math.round((parseFloat(l.amountStr) || 0) * 100);
      if (l.isDebit) dr += amt;
      else cr += amt;
    }
    const d = dr - cr;
    return {
      totalDr: dr,
      totalCr: cr,
      diff: d,
      isBalanced: dr > 0 && dr === cr,
    };
  }, [lines]);

  const accept = async () => {
    setError(null);
    if (!isBalanced) {
      setError(`Cannot save voucher: Debits (₹${(totalDr / 100).toFixed(2)}) must equal Credits (₹${(totalCr / 100).toFixed(2)}). Difference: ₹${(Math.abs(diff) / 100).toFixed(2)}`);
      return;
    }

    setSaving(true);
    try {
      const entries = lines.map((l) => ({
        ledgerId: l.ledgerId,
        isDebit: l.isDebit,
        amount: Math.round((parseFloat(l.amountStr) || 0) * 100),
        narration: l.narration,
      }));

      await window.ledgerdesk.postVoucher({
        voucherTypeId: selectedTypeId,
        voucherTypeName: selectedTypeName,
        voucherNumber,
        date: voucherDate,
        narration,
        ledgerEntries: entries,
      });

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const createQuickLedger = async () => {
    if (!quickLedgerName.trim()) return;
    try {
      const created = (await window.ledgerdesk.createLedger({
        name: quickLedgerName.trim(),
        groupId: quickGroupId,
      })) as { id: string; name: string };
      const updated = (await window.ledgerdesk.listLedgers()) as LedgerOption[];
      setLedgers(updated);
      setShowQuickLedger(false);
      setQuickLedgerName('');
      // Assign to the first empty line
      setLines((prev) => {
        const copy = [...prev];
        const emptyIdx = copy.findIndex((c) => !c.ledgerId);
        if (emptyIdx >= 0) copy[emptyIdx].ledgerId = created.id;
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'accept',
        label: 'Accept (Ctrl+A)',
        chord: { kind: 'key' as const, key: 'a', ctrl: true },
        buttonBar: true,
        enabled: !saving,
        run: () => {
          void accept();
        },
      },
      {
        id: 'contra',
        label: 'Contra (F4)',
        chord: { kind: 'f' as const, n: 4 },
        buttonBar: true,
        run: () => void switchType('Contra'),
      },
      {
        id: 'payment',
        label: 'Payment (F5)',
        chord: { kind: 'f' as const, n: 5 },
        buttonBar: true,
        run: () => void switchType('Payment'),
      },
      {
        id: 'receipt',
        label: 'Receipt (F6)',
        chord: { kind: 'f' as const, n: 6 },
        buttonBar: true,
        run: () => void switchType('Receipt'),
      },
      {
        id: 'journal',
        label: 'Journal (F7)',
        chord: { kind: 'f' as const, n: 7 },
        buttonBar: true,
        run: () => void switchType('Journal'),
      },
      {
        id: 'sales',
        label: 'Sales (F8)',
        chord: { kind: 'f' as const, n: 8 },
        buttonBar: true,
        run: () => void switchType('Sales'),
      },
      {
        id: 'purchase',
        label: 'Purchase (F9)',
        chord: { kind: 'f' as const, n: 9 },
        buttonBar: true,
        run: () => void switchType('Purchase'),
      },
      {
        id: 'quick-ledger',
        label: 'Create A/c (Alt+C)',
        chord: { kind: 'key' as const, key: 'c', alt: true },
        buttonBar: true,
        run: () => setShowQuickLedger(true),
      },
      {
        id: 'back',
        label: 'Quit (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: () => {
          if (showQuickLedger) setShowQuickLedger(false);
          else onBack();
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTypeId, voucherNumber, voucherDate, narration, lines, totalDr, totalCr, saving, showQuickLedger],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      {/* Top Header */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Voucher Type</label>
            <select
              value={selectedTypeId}
              onChange={(e) => {
                const vt = voucherTypes.find((x) => x.id === e.target.value);
                if (vt) void switchType(vt.name);
              }}
              style={{ fontWeight: 700, fontSize: '15px' }}
            >
              {voucherTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Voucher No.</label>
            <input
              type="text"
              value={voucherNumber}
              onChange={(e) => setVoucherNumber(e.target.value)}
              style={{ width: '100px', fontWeight: 600 }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Date</label>
          <input
            type="date"
            value={voucherDate}
            onChange={(e) => setVoucherDate(e.target.value)}
            style={{ fontWeight: 600 }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem 0.75rem', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Accounting Entries Table */}
      <div style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-surface)', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem', width: '80px' }}>Dr / Cr</th>
              <th style={{ padding: '0.5rem' }}>Particulars (Ledger Name)</th>
              <th style={{ padding: '0.5rem', width: '150px', textAlign: 'right' }}>Debit (₹)</th>
              <th style={{ padding: '0.5rem', width: '150px', textAlign: 'right' }}>Credit (₹)</th>
              <th style={{ padding: '0.5rem', width: '50px' }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.35rem 0.5rem' }}>
                  <select
                    value={line.isDebit ? 'Dr' : 'Cr'}
                    onChange={(e) => updateLine(idx, { isDebit: e.target.value === 'Dr' })}
                    style={{ width: '100%', fontWeight: 600 }}
                  >
                    <option value="Dr">Dr (To)</option>
                    <option value="Cr">Cr (By)</option>
                  </select>
                </td>

                <td style={{ padding: '0.35rem 0.5rem' }}>
                  <select
                    value={line.ledgerId}
                    onChange={(e) => updateLine(idx, { ledgerId: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Select Ledger (or Alt+C to create) —</option>
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} [{l.group_name}]
                      </option>
                    ))}
                  </select>
                </td>

                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                  {line.isDebit ? (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={line.amountStr}
                      onChange={(e) => updateLine(idx, { amountStr: e.target.value })}
                      style={{ width: '100%', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>

                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                  {!line.isDebit ? (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={line.amountStr}
                      onChange={(e) => updateLine(idx, { amountStr: e.target.value })}
                      style={{ width: '100%', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>

                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                  {lines.length > 2 && (
                    <button
                      onClick={() => removeLine(idx)}
                      style={{ padding: '2px 6px', fontSize: '11px', background: 'transparent' }}
                      title="Remove line"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '0.5rem' }}>
          <button onClick={addLine} style={{ fontSize: '12px' }}>
            + Add Line
          </button>
        </div>
      </div>

      {/* Narration and Totals */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Narration</label>
          <input
            type="text"
            placeholder="Being payment/receipt/journal entry..."
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '14px', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Debit</div>
            <div style={{ fontWeight: 700 }}>₹{(totalDr / 100).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Credit</div>
            <div style={{ fontWeight: 700 }}>₹{(totalCr / 100).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Difference</div>
            <div style={{ fontWeight: 700, color: diff === 0 ? '#10b981' : '#f87171' }}>
              ₹{(Math.abs(diff) / 100).toFixed(2)}
            </div>
          </div>
        </div>

        <button
          className="primary"
          disabled={!isBalanced || saving}
          onClick={() => void accept()}
          style={{ height: '38px', padding: '0 1.25rem', fontWeight: 600 }}
        >
          Accept (Ctrl+A)
        </button>
      </div>

      {/* Inline Alt+C Quick Ledger Creation Modal */}
      {showQuickLedger && (
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
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              width: '400px',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Inline Ledger Creation (Alt+C)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Ledger Name *</label>
                <input
                  type="text"
                  value={quickLedgerName}
                  onChange={(e) => setQuickLedgerName(e.target.value)}
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Under Group *</label>
                <select
                  value={quickGroupId}
                  onChange={(e) => setQuickGroupId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {session.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={() => setShowQuickLedger(false)}>Cancel (Esc)</button>
                <button className="primary" onClick={() => void createQuickLedger()}>
                  Create Ledger (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
