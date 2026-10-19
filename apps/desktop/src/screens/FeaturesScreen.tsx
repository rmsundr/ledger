import { useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';
import type { CompanyFeatures } from '../types/session';

interface Props {
  features: CompanyFeatures;
  onSaved: (features: CompanyFeatures) => void;
  onBack: () => void;
}

const FLAGS: { key: keyof CompanyFeatures; label: string }[] = [
  { key: 'maintain_accounts', label: 'Maintain accounts' },
  { key: 'maintain_inventory', label: 'Maintain inventory' },
  { key: 'integrate_accounts_inventory', label: 'Integrate accounts with inventory' },
  { key: 'bill_wise_details', label: 'Bill-wise details' },
  { key: 'cost_centres', label: 'Cost centres' },
  { key: 'interest_calculation', label: 'Interest calculation' },
  { key: 'budgets_and_controls', label: 'Budgets & controls' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'gst', label: 'GST' },
  { key: 'tds', label: 'TDS' },
  { key: 'tcs', label: 'TCS' },
  { key: 'debit_credit_notes', label: 'Debit / Credit notes' },
  { key: 'invoice_mode', label: 'Invoice mode' },
  { key: 'optional_vouchers', label: 'Optional vouchers' },
  { key: 'memorandum_vouchers', label: 'Memorandum vouchers' },
  { key: 'batches', label: 'Batches' },
  { key: 'manufacturing_bom', label: 'Manufacturing / BOM' },
  { key: 'order_processing', label: 'Order processing' },
  { key: 'purchase_sales_orders', label: 'Purchase & sales orders' },
];

export function FeaturesScreen({ features, onSaved, onBack }: Props) {
  const [local, setLocal] = useState(features);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: keyof CompanyFeatures) => {
    setLocal((f) => ({
      ...f,
      [key]: f[key] === 1 ? 0 : 1,
    }));
  };

  const accept = async () => {
    setError(null);
    try {
      const patch: Record<string, number> = {};
      for (const { key } of FLAGS) {
        const v = local[key];
        if (typeof v === 'number') patch[key] = v;
      }
      const saved = (await window.ledgerdesk.updateFeatures(patch)) as CompanyFeatures;
      onSaved(saved);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const actions = useMemo(
    () => [
      {
        id: 'accept',
        label: 'Accept',
        chord: { kind: 'key' as const, key: 'a', ctrl: true },
        buttonBar: true,
        run: () => {
          void accept();
        },
      },
      {
        id: 'back',
        label: 'Back',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onBack,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [local, onBack],
  );

  useKeyboard(actions);

  return (
    <div>
      <h1 className="screen-title">Company Features (F11)</h1>
      <p className="muted">Toggle features for this company. Ctrl+A to save.</p>
      {error && <p className="error">{error}</p>}
      <div className="feature-list" style={{ marginTop: '0.75rem' }}>
        {FLAGS.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={local[key] === 1}
              onChange={() => toggle(key)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => void accept()}>
          Accept (Ctrl+A)
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back (Esc)
        </button>
      </div>
    </div>
  );
}
