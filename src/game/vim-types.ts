import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';

export type VimMode = 'normal' | 'insert' | 'replace' | 'visual' | 'visual-line' | 'command' | 'search';

export type VimModeEvent =
  | 'ENTER_INSERT'
  | 'ENTER_REPLACE'
  | 'ENTER_VISUAL'
  | 'ENTER_VISUAL_LINE'
  | 'ENTER_COMMAND'
  | 'ENTER_SEARCH'
  | 'EXIT_TO_NORMAL';

export const VIM_MODE_TRANSITIONS: TransitionTable<VimMode, VimModeEvent> = {
  normal: {
    ENTER_INSERT: 'insert',
    ENTER_REPLACE: 'replace',
    ENTER_VISUAL: 'visual',
    ENTER_VISUAL_LINE: 'visual-line',
    ENTER_COMMAND: 'command',
    ENTER_SEARCH: 'search',
    EXIT_TO_NORMAL: 'normal',
  },
  insert: { EXIT_TO_NORMAL: 'normal' },
  replace: { EXIT_TO_NORMAL: 'normal' },
  visual: { EXIT_TO_NORMAL: 'normal', ENTER_COMMAND: 'command' },
  'visual-line': { EXIT_TO_NORMAL: 'normal', ENTER_COMMAND: 'command' },
  command: { EXIT_TO_NORMAL: 'normal' },
  search: { EXIT_TO_NORMAL: 'normal' },
};

export function createVimModeMachine(): StateMachine<VimMode, VimModeEvent> {
  return createStateMachine<VimMode, VimModeEvent>({
    initial: 'normal',
    transitions: VIM_MODE_TRANSITIONS,
  });
}

export interface VimOpenPayload {
  path: string;
  content: string;
  readOnly: boolean;
  startLine?: number;
  startCol?: number;
  showNumbers?: boolean;
  isNewFile?: boolean;
  searchPattern?: string;
}

export interface VimIo {
  read(path: string): { ok: true; content: string; exists: boolean } | { ok: false; error: string };
  write(path: string, content: string): { ok: true; message?: string } | { ok: false; error: string };
}

export type VimStepOutcome = 'continue' | 'saved' | 'quit' | 'saved-quit';

export type VimCliResult =
  | {
      kind: 'headless';
      code: number;
      stdout: string;
      stderr: string;
      saved: boolean;
      savedPath: string | null;
    }
  | {
      kind: 'open';
      payload: VimOpenPayload;
      warning?: string;
    }
  | {
      kind: 'error';
      code: number;
      stderr: string;
    };

export interface VimHistoryEntry {
  lines: string[];
  trailingNl: boolean;
  row: number;
  col: number;
}

export interface VimFindSpec {
  ch: string;
  forward: boolean;
  till: boolean;
}

export interface VimLastChange {
  kind: 'normal' | 'insert-seq';
  cmd?: string;
  arg?: string;
  count?: number;
  inserted?: string;
}

export interface VimState {
  path: string;
  lines: string[];
  trailingNl: boolean;
  row: number;
  col: number;
  scrollRow: number;
  readOnly: boolean;
  isNewFile: boolean;
  dirty: boolean;
  showNumbers: boolean;
  pendingKey: string;
  countBuf: string;
  yankBuf: string;
  yankLinewise: boolean;
  exBuf: string;
  searchBuf: string;
  searchForward: boolean;
  searchPattern: string;
  searchHighlight: boolean;
  visualAnchor: { row: number; col: number } | null;
  status: string;
  statusKind: 'info' | 'warn' | 'error';
  lastFind: VimFindSpec | null;
  lastChange: VimLastChange | null;
  insertCapture: { entryCmd: string; typed: string } | null;
  undoStack: VimHistoryEntry[];
  redoStack: VimHistoryEntry[];
  readonly modeMachine: StateMachine<VimMode, VimModeEvent>;
}
