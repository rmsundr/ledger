import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { chordMatches, formatChord, type ShortcutAction } from './types';

interface KeyboardContextValue {
  register: (actions: ShortcutAction[]) => () => void;
  buttonBarActions: ShortcutAction[];
  statusHint: string;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const layers = useRef<ShortcutAction[][]>([]);
  const [buttonBarActions, setButtonBarActions] = useState<ShortcutAction[]>([]);
  const [statusHint, setStatusHint] = useState('Esc: Back · Enter: Next · Ctrl+A: Accept');

  const rebuild = useCallback(() => {
    const flat = layers.current.flat();
    setButtonBarActions(flat.filter((a) => a.buttonBar && a.enabled !== false));
    const accept = flat.find((a) => a.id === 'accept');
    const back = flat.find((a) => a.id === 'back' || a.id === 'cancel');
    const bits = [
      back ? `${formatChord(back.chord)}: ${back.label}` : null,
      'Enter: Next field',
      accept ? `${formatChord(accept.chord)}: ${accept.label}` : null,
    ].filter(Boolean);
    setStatusHint(bits.join(' · '));
  }, []);

  const register = useCallback(
    (actions: ShortcutAction[]) => {
      layers.current.push(actions);
      rebuild();
      return () => {
        layers.current = layers.current.filter((l) => l !== actions);
        rebuild();
      };
    },
    [rebuild],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Enter moves to next field inside forms
      if (e.key === 'Enter' && typing && target instanceof HTMLInputElement) {
        e.preventDefault();
        const form = target.form;
        if (form) {
          const elements = Array.from(form.elements).filter(
            (el): el is HTMLElement =>
              el instanceof HTMLInputElement ||
              el instanceof HTMLSelectElement ||
              el instanceof HTMLTextAreaElement ||
              el instanceof HTMLButtonElement,
          );
          const idx = elements.indexOf(target);
          const next = elements[idx + 1];
          if (next) next.focus();
        }
        return;
      }

      const flat = layers.current.flat().slice().reverse();
      for (const action of flat) {
        if (action.enabled === false) continue;
        if (!chordMatches(e, action.chord)) continue;
        // Allow Ctrl/Alt chords even while typing; block bare letters
        if (
          typing &&
          action.chord.kind === 'key' &&
          !action.chord.ctrl &&
          !action.chord.alt &&
          action.chord.key.length === 1
        ) {
          continue;
        }
        e.preventDefault();
        action.run();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ register, buttonBarActions, statusHint }),
    [register, buttonBarActions, statusHint],
  );

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}

export function useKeyboard(actions: ShortcutAction[]): void {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useKeyboard requires KeyboardProvider');

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const proxy = actions.map((a) => ({
      ...a,
      run: () => {
        const latest = actionsRef.current.find((x) => x.id === a.id);
        latest?.run();
      },
    }));
    return ctx.register(proxy);
    // Re-register when identity set of ids/chords changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, actions.map((a) => `${a.id}:${JSON.stringify(a.chord)}:${a.enabled !== false}`).join('|')]);
}

export function useButtonBar(): ShortcutAction[] {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useButtonBar requires KeyboardProvider');
  return ctx.buttonBarActions;
}

export function useStatusHint(): string {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useStatusHint requires KeyboardProvider');
  return ctx.statusHint;
}
