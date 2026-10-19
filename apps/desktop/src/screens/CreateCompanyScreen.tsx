import { useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';

interface Props {
  onCreated: (registryId: string) => Promise<void>;
  onCancel: () => void;
}

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Karnataka',
  'Kerala',
  'Maharashtra',
  'Tamil Nadu',
  'Telangana',
  'Delhi',
  'Gujarat',
  'Rajasthan',
  'West Bengal',
  'Other',
];

export function CreateCompanyScreen({ onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    name: '',
    mailingName: '',
    addressLine1: '',
    state: 'Kerala',
    country: 'India',
    pin: '',
    phone: '',
    email: '',
    financialYearBegin: '2025-04-01',
    booksBegin: '2025-04-01',
    companyPan: '',
    gstin: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = (await window.ledgerdesk.createCompany({
        ...form,
        mailingName: form.mailingName || form.name,
      })) as { registryId: string };
      await onCreated(result.registryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'accept',
        label: 'Accept',
        chord: { kind: 'key' as const, key: 'a', ctrl: true },
        buttonBar: true,
        enabled: !saving,
        run: () => {
          void accept();
        },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onCancel,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, onCancel, saving],
  );

  useKeyboard(actions);

  return (
    <div>
      <h1 className="screen-title">Create Company</h1>
      <p className="muted">Ctrl+A to save · Esc to cancel · Enter to move to next field</p>
      {error && <p className="error">{error}</p>}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input autoFocus value={form.name} onChange={set('name')} required />
        </label>
        <label className="field">
          <span>Mailing name</span>
          <input value={form.mailingName} onChange={set('mailingName')} />
        </label>
        <label className="field">
          <span>Address</span>
          <input value={form.addressLine1} onChange={set('addressLine1')} />
        </label>
        <label className="field">
          <span>State</span>
          <select value={form.state} onChange={set('state')}>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Country</span>
          <input value={form.country} onChange={set('country')} />
        </label>
        <label className="field">
          <span>PIN</span>
          <input value={form.pin} onChange={set('pin')} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input value={form.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          <span>Email</span>
          <input value={form.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span>Financial year begins</span>
          <input type="date" value={form.financialYearBegin} onChange={set('financialYearBegin')} />
        </label>
        <label className="field">
          <span>Books begin</span>
          <input type="date" value={form.booksBegin} onChange={set('booksBegin')} />
        </label>
        <label className="field">
          <span>PAN</span>
          <input value={form.companyPan} onChange={set('companyPan')} />
        </label>
        <label className="field">
          <span>GSTIN</span>
          <input value={form.gstin} onChange={set('gstin')} />
        </label>
        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create (Ctrl+A)'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel (Esc)
          </button>
        </div>
      </form>
    </div>
  );
}
