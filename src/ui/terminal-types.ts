import type { Terminal } from '@xterm/xterm';

export interface ShellHooks {
  /** Run one line. Return the text to print (ANSI allowed, \n line ends) and whether to clear first. */
  run(line: string): { output: string; clear?: boolean; stderr?: string };
  complete(lineBeforeCursor: string): { line: string; matches: string[] };
  prompt(): { cwd: string; gold: boolean };
}

export interface Shell {
  readonly term: Terminal;
  /** Queue a line exactly as if typed + Enter. Resolves after it has run (waits while blocked). */
  submit(line: string): Promise<void>;
  /** Print text above the input line without disturbing what the player is typing. */
  printAbove(text: string): void;
  setBlocked(blocked: boolean): void;
  readonly blocked: boolean;
  /** True while blocked or lines are still queued. */
  busy(): boolean;
  /** Type text out over `ms` (ANSI kept atomic). Only while no prompt is shown, e.g. blocked. */
  typeOut(text: string, ms: number): Promise<void>;
  /** Wipe the screen and the scrollback, keep history. */
  reset(banner?: string): void;
  fit(): void;
  focus(): void;
  blur(): void;
}
