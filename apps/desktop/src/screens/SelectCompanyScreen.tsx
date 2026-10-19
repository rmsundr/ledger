import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { RegistryCompany } from '../types/session';

interface Props {
  onCreate: () => void;
  onOpen: (id: string) => Promise<void>;
  onQuit: () => void;
}

export function SelectCompanyScreen({ onCreate, onOpen, onQuit }: Props) {
  const [companies, setCompanies] = useState<RegistryCompany[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await window.ledgerdesk.listCompanies()) as RegistryCompany[];
      setCompanies(list);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const selected = companies[index];

  const actions = useMemo(
    () => [
      {
        id: 'open',
        label: 'Open',
        chord: { kind: 'key' as const, key: 'Enter' },
        buttonBar: true,
        enabled: !!selected,
        run: () => {
          if (!selected) return;
          void onOpen(selected.id).catch((e) =>
            setError(e instanceof Error ? e.message : String(e)),
          );
        },
      },
      {
        id: 'create',
        label: 'Create Company',
        chord: { kind: 'key' as const, key: 'c', alt: true },
        buttonBar: true,
        run: onCreate,
      },
      {
        id: 'delete',
        label: 'Delete',
        chord: { kind: 'key' as const, key: 'd', alt: true },
        buttonBar: true,
        enabled: !!selected,
        run: () => {
          if (!selected) return;
          if (!confirm(`Delete company "${selected.name}" and its database file?`)) return;
          void window.ledgerdesk
            .deleteCompany(selected.id)
            .then(reload)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
        },
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
        run: () => setIndex((i) => Math.min(companies.length - 1, i + 1)),
      },
      {
        id: 'quit',
        label: 'Quit',
        chord: { kind: 'key' as const, key: 'q', ctrl: true },
        buttonBar: true,
        run: onQuit,
      },
    ],
    [companies.length, onCreate, onOpen, onQuit, selected],
  );

  useKeyboard(actions);

  return (
    <div>
      <h1 className="screen-title">Select Company</h1>
      <p className="muted">Choose a company to open, or create a new one (Alt+C).</p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && companies.length === 0 && (
        <div className="hint">No companies yet. Press Alt+C to create your first company.</div>
      )}
      <div style={{ marginTop: '0.75rem' }}>
        {companies.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="company-card"
            data-active={i === index}
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => setIndex(i)}
            onDoubleClick={() => void onOpen(c.id)}
          >
            <strong>{c.name}</strong>
            <div className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              FY from {c.financial_year_begin} · Books from {c.books_begin}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
