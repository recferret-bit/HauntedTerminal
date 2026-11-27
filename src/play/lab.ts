import { createChapterSession } from '../chapters/chapter-session.js';
import { readDraftPack } from '../chapters/draft.js';
import { readLabConfig } from '../chapters/lab-config.js';
import { isLabSession, type LabConfig, type LabInjection } from '../chapters/session-lab-types.js';
import type { ExecRecord } from '../contracts/exec-record.js';
import { createSession, type Session } from '../game/session.js';
import type { CommandResult, TickResult } from '../game/types.js';
import { swapPlaySession } from './session-swap.js';
import type { Play } from './state.js';

/** Lines kept for the lab; the lab reads them as they come, so old ones only matter for a late reader. */
const EXEC_LOG_CAP = 400;

export function labConfigFor(params: URLSearchParams, hasDraft: boolean, packId: string): LabConfig | null {
  return params.get('lab') === '1' && hasDraft ? readLabConfig(packId) : null;
}

/** Remembers what a typed line answered, in a lab game only. */
export function recordExec(play: Play, line: string, res: CommandResult): void {
  if (!play.terminalLab || !line.trim()) return;
  play.execLog.push({ line, output: res.output, stderr: res.stderr ?? '', code: res.code, events: res.events });
  if (play.execLog.length > EXEC_LOG_CAP) play.execLog.splice(0, play.execLog.length - EXEC_LOG_CAP);
  play.execCount += 1;
}

function frameHasFocus(): boolean {
  if (!document.hasFocus()) return false;
  try {
    if (window.frameElement && window.parent !== window) {
      return window.parent.document.activeElement === window.frameElement;
    }
  } catch {
    /* cross-origin */
  }
  return true;
}

/** Replaces the running lab session in place without reloading the iframe or rebuilding the WebGL stage. */
function swapLabSession(play: Play, packId: string, levelId: string): boolean {
  const draft = readDraftPack(packId);
  if (!draft) return false;
  const lab = readLabConfig(packId);
  const hadFocus = frameHasFocus();
  const next: Session = lab.classic
    ? createSession({ lab })
    : createChapterSession({
        chapterId: packId,
        pack: draft,
        preview: true,
        startLevelId: levelId,
        lab,
      });
  swapPlaySession(play, {
    next,
    manifest: lab.classic ? undefined : draft.manifest,
    terminalLab: lab,
    emitFloorCard: true,
    arrive: true,
    resetShell: true,
    focusTerminal: hadFocus,
  });
  return true;
}

/** `window.__lab`, in a lab game only: read the level, advance the world one tick, add an enemy or pickup, swap sessions, read the lines run. */
export function exposeLabHooks(play: Play): void {
  if (!play.terminalLab || !isLabSession(play.session)) return;
  const current = () => {
    if (!isLabSession(play.session)) throw new Error('the active session is not a lab session');
    return play.session;
  };
  const applied = (res: TickResult): TickResult => {
    play.events.emit({ kind: 'apply-tick', res });
    return res;
  };
  const api = {
    seq: () => play.sessionSeq,
    swap: (packId: string, levelId: string) => swapLabSession(play, packId, levelId),
    inspect: () => current().inspect(),
    tick: () => applied(current().labTick()),
    inject: (what: LabInjection) => applied(current().inject(what)),
    /** Lines run so far: `count` never shrinks, `entries` holds the newest ones. */
    execLog: (): { count: number; entries: ExecRecord[] } => ({ count: play.execCount, entries: play.execLog }),
  };
  (window as unknown as { __lab?: typeof api }).__lab = api;
}
