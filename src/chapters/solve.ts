import { createChapterSession } from './chapter-session.js';
import type { ChapterPack } from './types.js';

export interface LevelSolveReport {
  levelId: string;
  ok: boolean;
  commands: number;
  deaths: number;
  /** Why it failed: the objectives still open, or the command that threw. */
  problem?: string;
  /** Last terminal output, to see where the solution stopped working. */
  lastOutput?: string;
}

export interface SolveReport {
  chapterId: string;
  ok: boolean;
  deaths: number;
  commands: number;
  levels: LevelSolveReport[];
}

export interface SolveOptions {
  /** Pressure between commands (the harness uses 2): that many clock seconds, and one fewer forced enemy turns in a battle. */
  ticks?: number;
  /** Solve only this level, entering it with the chapter's `grants`. Default: the whole chapter in order. */
  levelId?: string;
}

/**
 * Plays every level's `solutionCommands` headlessly under enemy turn pressure (see the loop below).
 * A level passes when the session moves on (or the chapter ends) with 0 deaths.
 * Runs as a preview: progress, scrap and telemetry are never written.
 */
export function solvePack(pack: ChapterPack, options: SolveOptions = {}): SolveReport {
  const ticks = options.ticks ?? 2;
  const report: SolveReport = { chapterId: pack.manifest.id, ok: true, deaths: 0, commands: 0, levels: [] };
  const only = options.levelId;
  const session = createChapterSession({ chapterId: pack.manifest.id, pack, preview: true, startLevelId: only });
  session.skipIntro();
  for (const spec of pack.levels) {
    if (only && spec.id !== only) continue;
    const entry: LevelSolveReport = { levelId: spec.id, ok: false, commands: 0, deaths: 0 };
    report.levels.push(entry);
    if (session.getCurrentLevel().id !== spec.id) {
      entry.problem = `session is on "${session.getCurrentLevel().id}" instead of "${spec.id}"`;
      break;
    }
    try {
      for (const cmd of spec.solutionCommands) {
        // Turn-based pressure: `ticks` real seconds pass (script.timed, the battle clock), and in a battle the
        // turn timer runs out `ticks - 1` times; then the command is one action, answered by one enemy turn.
        for (let t = 0; t < ticks; t++) {
          entry.deaths += session.tick().events.filter((e) => e.type === 'PLAYER_RESPAWNED').length;
        }
        for (let t = 1; t < ticks; t++) {
          const forced = session.forceEnemyTurn();
          if (forced) entry.deaths += forced.events.filter((e) => e.type === 'PLAYER_RESPAWNED').length;
        }
        if (session.snapshot().skippableDialog) session.skipOpeningDialog();
        if (session.snapshot().pendingLaptopTasks?.length) {
          const lapRes = session.completePendingLaptopTasks?.();
          if (lapRes) entry.deaths += lapRes.events.filter((e) => e.type === 'PLAYER_RESPAWNED').length;
          if (session.snapshot().skippableDialog) session.skipOpeningDialog();
        }
        const res = session.exec(cmd);
        entry.commands += 1;
        entry.lastOutput = res.output.slice(-400);
        entry.deaths += res.events.filter((e) => e.type === 'PLAYER_RESPAWNED').length;
      }
    } catch (err) {
      entry.problem = `threw: ${String((err as Error)?.message ?? err)}`;
      break;
    }
    const moved = session.getCurrentLevel().id !== spec.id || session.snapshot().ended;
    entry.ok = moved && entry.deaths === 0;
    if (!moved) {
      const open = session.getChecklist().filter((c) => !c.done).map((c) => c.description);
      entry.problem = open.length > 0 ? `still open: ${open.join(' | ')}` : 'objectives met but the exit was not taken';
    } else if (entry.deaths > 0) {
      entry.problem = `${entry.deaths} death(s)`;
    }
    if (!entry.ok) break;
  }
  for (const l of report.levels) {
    report.deaths += l.deaths;
    report.commands += l.commands;
  }
  const expected = only ? 1 : pack.levels.length;
  report.ok = report.levels.length === expected && report.levels.every((l) => l.ok);
  return report;
}
