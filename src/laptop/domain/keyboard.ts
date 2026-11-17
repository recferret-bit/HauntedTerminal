/**
 * The laptop's keyboard as data: rows of keys named by `KeyboardEvent.code`, so a real key press finds
 * its key on the deck. Widths are in key units; every row adds up to `ROW_UNITS`.
 */
export interface KeyDef {
  /** `KeyboardEvent.code` (`KeyA`, `ShiftLeft`, `Space`). */
  code: string;
  label: string;
  /** Width in key units (1 = a letter key). */
  w: number;
}

export const ROW_UNITS = 15;

const key = (code: string, label: string, w = 1): KeyDef => ({ code, label, w });
const letters = (s: string): KeyDef[] => [...s].map((c) => key(`Key${c}`, c));
const digits = (): KeyDef[] => [...'1234567890'].map((d) => key(`Digit${d}`, d));
const fkeys = (): KeyDef[] => Array.from({ length: 12 }, (_, i) => key(`F${i + 1}`, `F${i + 1}`));

/** The function row is half height; the rest are full keys. */
export const KEY_ROWS: readonly (readonly KeyDef[])[] = [
  [key('Escape', 'esc'), ...fkeys(), key('Delete', 'del', 2)],
  [key('Backquote', '`'), ...digits(), key('Minus', '-'), key('Equal', '='), key('Backspace', '<-', 2)],
  [key('Tab', 'tab', 1.5), ...letters('QWERTYUIOP'), key('BracketLeft', '['), key('BracketRight', ']'), key('Backslash', '\\', 1.5)],
  [key('CapsLock', 'caps', 1.75), ...letters('ASDFGHJKL'), key('Semicolon', ';'), key('Quote', "'"), key('Enter', 'enter', 2.25)],
  [key('ShiftLeft', 'shift', 1.25), ...letters('ZXCVBNM'), key('Comma', ','), key('Period', '.'), key('Slash', '/'), key('ShiftRight', 'shift', 1.75), key('ArrowUp', '^'), key('PageUp', 'pg^')],
  [
    key('ControlLeft', 'ctrl', 1.25), key('Fn', 'fn'), key('MetaLeft', '*'), key('AltLeft', 'alt', 1.25), key('Space', '', 5.5),
    key('AltRight', 'alt'), key('ControlRight', 'ctrl'), key('ArrowLeft', '<'), key('ArrowDown', 'v'), key('ArrowRight', '>'),
  ],
];

export const ALL_KEYS: readonly KeyDef[] = KEY_ROWS.flat();

/** Real keys a laptop of this age does not have land on their nearest neighbour. */
const ALIASES: Readonly<Record<string, string>> = {
  MetaRight: 'MetaLeft', OSLeft: 'MetaLeft', OSRight: 'MetaLeft', ContextMenu: 'MetaLeft',
  PageDown: 'PageUp', Home: 'PageUp', End: 'PageUp', Insert: 'Delete',
  NumpadEnter: 'Enter', IntlBackslash: 'Backslash',
};

/** The deck key a real `KeyboardEvent.code` presses, or null for keys with no place on this deck. */
export function deckKeyFor(code: string): string | null {
  const real = ALIASES[code] ?? code.replace(/^Numpad(\d)$/, 'Digit$1');
  return ALL_KEYS.some((k) => k.code === real) ? real : null;
}
