export type KeyChord =
  | { kind: 'key'; key: string; ctrl?: boolean; alt?: boolean; shift?: boolean }
  | { kind: 'f'; n: number };

export interface ShortcutAction {
  id: string;
  label: string;
  chord: KeyChord;
  /** Shown in right button bar when true */
  buttonBar?: boolean;
  enabled?: boolean;
  run: () => void;
}

export function chordMatches(e: KeyboardEvent, chord: KeyChord): boolean {
  if (chord.kind === 'f') {
    return e.key === `F${chord.n}` && !e.ctrlKey && !e.altKey && !e.metaKey;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const target = chord.key.length === 1 ? chord.key.toLowerCase() : chord.key;
  return (
    key === target &&
    !!e.ctrlKey === !!chord.ctrl &&
    !!e.altKey === !!chord.alt &&
    !!e.shiftKey === !!chord.shift &&
    !e.metaKey
  );
}

export function formatChord(chord: KeyChord): string {
  if (chord.kind === 'f') return `F${chord.n}`;
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  return parts.join('+');
}
