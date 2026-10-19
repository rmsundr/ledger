import { useMemo } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';

interface Props {
  title: string;
  note: string;
  onBack: () => void;
}

export function PlaceholderScreen({ title, note, onBack }: Props) {
  const actions = useMemo(
    () => [
      {
        id: 'back',
        label: 'Back',
        chord: { kind: 'key' as const, key: 'Escape' },
        buttonBar: true,
        run: onBack,
      },
    ],
    [onBack],
  );
  useKeyboard(actions);

  return (
    <div>
      <h1 className="screen-title">{title}</h1>
      <div className="hint">{note}</div>
      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>
          Back (Esc)
        </button>
      </div>
    </div>
  );
}
