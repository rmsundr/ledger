import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession } from '../types/session';

interface Props {
  session: OpenSession;
  onBack: () => void;
  onSelectLedger?: (ledgerId: string) => void;
}

interface LedgerItem {
  id: string;
  name: string;
  group_name: string;
  group_nature: string;
  closing_balance: number;
  closing_is_debit: number;
}

export function MastersScreen({ session, onBack, onSelectLedger }: Props) {
  const [ledgers, setLedgers] = useState<LedgerItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    groupId: session.groups[0]?.id ?? '',
    openingBalance: '0',
    openingIsDebit: true,
    maintainBillByBill: false,
    state: session.company.state,
    gstin: '',
  });
  const [error, setError] = useState<string | null>(null);

  const loadLedgers = async () => {
    try {
      const list = (await window.ledgerdesk.listLedgers()) as LedgerItem[];
      setLedgers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadLedgers();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgers;
    return ledgers.filter((l) => l.name.toLowerCase().includes(q) || l.group_name.toLowerCase().includes(q));
  }, [ledgers, search]);

  const saveLedger = async () => {
    setError(null);
    try {
      const paise = Math.round(parseFloat(form.openingBalance || '0') * 100);
      await window.ledgerdesk.createLedger({
        name: form.name.trim(),
        groupId: form.groupId,
        openingBalance: paise,
        openingIsDebit: form.openingIsDebit,
        maintainBillByBill: form.maintainBillByBill,
        state: form.state,
        gstin: form.gstin.trim(),
      });
      setShowCreateModal(false);
      setForm({
        name: '',
        groupId: session.groups[0]?.id ?? '',
        openingBalance: '0',
        openingIsDebit: true,
        maintainBillByBill: false,
        state: session.company.state,
        gstin: '',
      });
      await loadLedgers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'create',
        label: 'Create (Alt+C)',
        chord: { kind: 'key' as const, key: 'c', alt: true },
        buttonBar: true,
        run: () => {
          setShowCreateModal(true);
        },
      },
      {
        id: 'back',
        label: 'Back (Esc)',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: () => {
          if (showCreateModal) {
            setShowCreateModal(false);
          } else {
            onBack();
          }
        },
      },
    ],
    [showCreateModal, onBack],
  );

  useKeyboard(actions);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>List of Accounts (Ledgers)</h2>
          <span className="muted">Total: {ledgers.length} ledgers | Company: {session.company.name}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="primary" onClick={() => setShowCreateModal(true)}>
            Create Ledger (Alt+C)
          </button>
          <button onClick={onBack}>Back (Esc)</button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.5rem', marginBottom: '1rem' }}>{error}</div>}

      <div style={{ marginBottom: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search by ledger or group name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          style={{ width: '100%', maxWidth: '400px' }}
          autoFocus
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Ledger Name</th>
              <th style={{ padding: '0.5rem' }}>Under Group</th>
              <th style={{ padding: '0.5rem' }}>Nature</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Closing Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, idx) => {
              const isSelected = idx === selectedIndex;
              const formattedBal = (l.closing_balance / 100).toFixed(2);
              const sign = l.closing_is_debit === 1 ? 'Dr' : 'Cr';

              return (
                <tr
                  key={l.id}
                  onClick={() => {
                    setSelectedIndex(idx);
                    if (onSelectLedger) onSelectLedger(l.id);
                  }}
                  style={{
                    background: isSelected ? 'var(--accent-dim)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{l.name}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }} className="muted">{l.group_name}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{l.group_nature}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    ₹{formattedBal} {sign}
                  </td>
                </tr>
              );
            })}
          </tbody>
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
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              width: '480px',
              maxWidth: '90vw',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Ledger Creation (Alt+C)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Under Group *</label>
                <select
                  value={form.groupId}
                  onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {session.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.nature})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.openingBalance}
                    onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ width: '80px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>Dr/Cr</label>
                  <select
                    value={form.openingIsDebit ? 'Dr' : 'Cr'}
                    onChange={(e) => setForm({ ...form, openingIsDebit: e.target.value === 'Dr' })}
                    style={{ width: '100%' }}
                  >
                    <option value="Dr">Dr</option>
                    <option value="Cr">Cr</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="billwise"
                  checked={form.maintainBillByBill}
                  onChange={(e) => setForm({ ...form, maintainBillByBill: e.target.checked })}
                />
                <label htmlFor="billwise" style={{ fontSize: '13px' }}>Maintain balances bill-by-bill</label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>GSTIN</label>
                <input
                  type="text"
                  placeholder="29AAAAA0000A1Z5"
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={() => setShowCreateModal(false)}>Cancel (Esc)</button>
                <button className="primary" onClick={() => void saveLedger()}>
                  Save Ledger (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
