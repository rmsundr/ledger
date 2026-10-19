import { useEffect, useMemo, useState } from 'react';
import { useKeyboard } from '../keyboard/KeyboardProvider';

interface Props {
  onBack: () => void;
}

export function ConfigureScreen({ onBack }: Props) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontScale, setFontScale] = useState('1');

  useEffect(() => {
    const storedTheme = (localStorage.getItem('ld-theme') as 'dark' | 'light' | null) ?? 'dark';
    const storedScale = localStorage.getItem('ld-font-scale') ?? '1';
    setTheme(storedTheme);
    setFontScale(storedScale);
  }, []);

  const apply = () => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--font-scale', fontScale);
    localStorage.setItem('ld-theme', theme);
    localStorage.setItem('ld-font-scale', fontScale);
    onBack();
  };

  const actions = useMemo(
    () => [
      {
        id: 'accept',
        label: 'Accept',
        chord: { kind: 'key' as const, key: 'a', ctrl: true },
        buttonBar: true,
        run: apply,
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
    [theme, fontScale, onBack],
  );

  useKeyboard(actions);

  return (
    <div>
      <h1 className="screen-title">Configure (F12)</h1>
      <p className="muted">Display and input preferences for this workstation.</p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className="field">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="field">
          <span>Font scale</span>
          <select value={fontScale} onChange={(e) => setFontScale(e.target.value)}>
            <option value="0.9">Small</option>
            <option value="1">Normal</option>
            <option value="1.15">Large</option>
            <option value="1.3">Extra large</option>
          </select>
        </label>
        <div className="actions">
          <button type="submit" className="btn primary">
            Accept (Ctrl+A)
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Back (Esc)
          </button>
        </div>
      </form>
    </div>
  );
}
