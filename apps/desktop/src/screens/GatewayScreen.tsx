import { useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { OpenSession, Screen } from '../types/session';

interface Props {
  session: OpenSession;
  onNavigate: (screen: Screen) => void;
  onShut: () => void;
  onQuit: () => void;
  onChangeDate: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  shortcut: string;
  screen: Screen | null;
}

const MENU: MenuItem[] = [
  { key: '1', label: 'Accounts Info (Masters)', shortcut: 'A', screen: { id: 'masters' } },
  { key: '2', label: 'Accounting Vouchers', shortcut: 'V', screen: { id: 'voucher-entry', voucherTypeName: 'Payment' } },
  { key: '3', label: 'Day Book', shortcut: 'D', screen: { id: 'day-book' } },
  { key: '4', label: 'Trial Balance', shortcut: 'T', screen: { id: 'trial-balance' } },
  { key: '5', label: 'Profit & Loss A/c', shortcut: 'P', screen: { id: 'profit-loss' } },
  { key: '6', label: 'Balance Sheet', shortcut: 'B', screen: { id: 'balance-sheet' } },
  { key: '7', label: 'Stock Summary', shortcut: 'S', screen: { id: 'stock-summary' } },
  { key: '8', label: 'Bills Outstanding', shortcut: 'O', screen: { id: 'outstanding' } },
  { key: '9', label: 'Import / Export from Tally', shortcut: 'I', screen: { id: 'tally-import' } },
  { key: '0', label: 'Quit / Shut Company', shortcut: 'Q', screen: null },
];

export function GatewayScreen({ session, onNavigate, onShut, onQuit, onChangeDate }: Props) {
  const [index, setIndex] = useState(0);

  const activate = (i: number) => {
    const item = MENU[i];
    if (!item) return;
    if (item.screen) {
      onNavigate(item.screen);
      return;
    }
    onShut();
  };

  const actions = useMemo(
    () => [
      {
        id: 'accept',
        label: 'Select (Enter)',
        chord: { kind: 'key' as const, key: 'Enter' },
        buttonBar: true,
        run: () => activate(index),
      },
      {
        id: 'date',
        label: 'Date (F2)',
        chord: { kind: 'f' as const, n: 2 },
        buttonBar: true,
        run: onChangeDate,
      },
      {
        id: 'contra',
        label: 'Contra (F4)',
        chord: { kind: 'f' as const, n: 4 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Contra' }),
      },
      {
        id: 'payment',
        label: 'Payment (F5)',
        chord: { kind: 'f' as const, n: 5 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Payment' }),
      },
      {
        id: 'receipt',
        label: 'Receipt (F6)',
        chord: { kind: 'f' as const, n: 6 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Receipt' }),
      },
      {
        id: 'journal',
        label: 'Journal (F7)',
        chord: { kind: 'f' as const, n: 7 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Journal' }),
      },
      {
        id: 'sales',
        label: 'Sales (F8)',
        chord: { kind: 'f' as const, n: 8 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Sales' }),
      },
      {
        id: 'purchase',
        label: 'Purchase (F9)',
        chord: { kind: 'f' as const, n: 9 },
        buttonBar: true,
        run: () => onNavigate({ id: 'voucher-entry', voucherTypeName: 'Purchase' }),
      },
      {
        id: 'features',
        label: 'Features (F11)',
        chord: { kind: 'f' as const, n: 11 },
        buttonBar: true,
        run: () => onNavigate({ id: 'features' }),
      },
      {
        id: 'configure',
        label: 'Configure (F12)',
        chord: { kind: 'f' as const, n: 12 },
        buttonBar: true,
        run: () => onNavigate({ id: 'configure' }),
      },
      {
        id: 'up',
        label: 'Up',
        chord: { kind: 'key' as const, key: 'ArrowUp' },
        run: () => setIndex((i) => Math.max(0, i - 1)),
      },
      {
        id: 'down',
        label: 'Down',
        chord: { kind: 'key' as const, key: 'ArrowDown' },
        run: () => setIndex((i) => Math.min(MENU.length - 1, i + 1)),
      },
      ...MENU.map((m, i) => ({
        id: `menu-${m.key}`,
        label: m.label,
        chord: { kind: 'key' as const, key: m.key },
        run: () => {
          setIndex(i);
          activate(i);
        },
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, session, onChangeDate, onNavigate, onShut],
  );

  useKeyboard(actions);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '420px', border: '2px solid var(--border)', background: 'var(--bg-surface)' }}>
        <div
          style={{
            background: 'var(--bg-elevated)',
            padding: '0.6rem 1rem',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '15px',
            borderBottom: '1px solid var(--border)',
            letterSpacing: '0.05em',
          }}
        >
          Gateway of LedgerDesk
        </div>

        <div style={{ padding: '0.5rem 0' }}>
          {MENU.map((item, i) => {
            const isSelected = i === index;
            return (
              <div
                key={item.key}
                onClick={() => {
                  setIndex(i);
                  activate(i);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.45rem 1.25rem',
                  background: isSelected ? 'var(--accent-dim)' : 'transparent',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '13px',
                }}
              >
                <span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: '8px' }}>{item.shortcut}</span>
                  {item.label}
                </span>
                <span className="muted" style={{ fontFamily: 'var(--font-mono)' }}>[{item.key}]</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
