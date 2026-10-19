import { formatChord } from './types';
import { useButtonBar } from './KeyboardProvider';

export function ButtonBar() {
  const actions = useButtonBar();
  return (
    <aside className="button-bar" aria-label="Shortcut button bar">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className="btn-bar-item"
          onClick={() => a.run()}
          title={formatChord(a.chord)}
        >
          <span className="key">{formatChord(a.chord)}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </aside>
  );
}
