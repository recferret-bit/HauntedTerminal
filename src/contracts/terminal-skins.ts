/**
 * The terminal skins of the play page, as plain data (spec .kiro/specs/terminal-skins/). A skin only changes the window
 * chrome around the terminal (title bar, window buttons, tab row, bezel); the terminal body is the same in every skin.
 * The shell (`skin`) and the UI (Esc menu, `src/ui/terminal-skin.ts`) both read this one table.
 */
export interface TerminalSkin {
  id: string;
  /** Shown by `skin` and in the Esc menu picker. */
  label: string;
  /** The window title text (unused by Windows Terminal, whose tab is its title, and by VT100, which has no title bar). */
  title: string;
  /** The text of the one tab (shown by iTerm2 and Windows Terminal). */
  tab: string;
}

export const TERMINAL_SKINS = [
  { id: 'iterm2', label: 'iTerm2', title: 'vibecoder@motherboard: ~ (zsh)', tab: 'zsh' },
  { id: 'terminal-app', label: 'macOS Terminal', title: 'dev — -zsh — 80×24', tab: '-zsh' },
  { id: 'putty', label: 'PuTTY', title: 'haunted.local - PuTTY', tab: 'PuTTY' },
  { id: 'windows-terminal', label: 'Windows Terminal', title: 'dev@haunted: ~', tab: 'dev@haunted: ~' },
  { id: 'gnome-terminal', label: 'GNOME Terminal', title: 'dev@haunted: ~', tab: 'dev@haunted: ~' },
  { id: 'vt100', label: 'VT100', title: 'VT100', tab: 'VT100' },
] as const satisfies readonly TerminalSkin[];

export type TerminalSkinId = (typeof TERMINAL_SKINS)[number]['id'];

export const SKIN_IDS: readonly TerminalSkinId[] = TERMINAL_SKINS.map((s) => s.id);

/** Today's look, and the fallback when nothing else applies. */
export const DEFAULT_SKIN: TerminalSkinId = 'iterm2';

export function isSkinId(v: unknown): v is TerminalSkinId {
  return typeof v === 'string' && (SKIN_IDS as readonly string[]).includes(v);
}

export function skinById(id: TerminalSkinId): TerminalSkin {
  return TERMINAL_SKINS.find((s) => s.id === id) ?? TERMINAL_SKINS[0];
}
