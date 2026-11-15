import { createChapterSession } from '../chapters/chapter-session.js';
import type { LabSession } from '../chapters/session-lab-types.js';
import { createSession } from '../game/session.js';
import { buildLabPack, LAB_LEVEL_ID } from './lab-pack.js';
import type { LabScript } from './lab-types.js';
import { emitResult, tickResult, type DriverResult, type LabDriver } from './runner.js';

/**
 * A lab session on the real `ChapterSession` (or classic `createSession` when `script.driver === 'classic'`), started without
 * an intro. Time passes only on `labTick()`, whatever the lab's clock says, so a headless run is exactly repeatable.
 */
export function openLabSession(script: LabScript): LabSession {
  const { pack, config } = buildLabPack(script);
  const lab = { ...config, clock: 'manual' as const };
  if (script.driver === 'classic') {
    const session = createSession({ lab });
    session.skipIntro();
    return session;
  }
  const session = createChapterSession({ chapterId: pack.manifest.id, pack, preview: true, startLevelId: LAB_LEVEL_ID, lab });
  session.skipIntro();
  session.arriveLevel();
  return session;
}

/** Runs a lab script's level headlessly: no browser, no stage, no clock. */
export function createNodeDriver(script: LabScript): LabDriver {
  let session = openLabSession(script);
  return {
    async reset() {
      session = openLabSession(script);
    },
    async run(line): Promise<DriverResult> {
      const r = session.exec(line);
      return { output: r.output, stderr: r.stderr ?? '', code: r.code, events: r.events };
    },
    async tick(): Promise<DriverResult> {
      return tickResult(session.labTick());
    },
    emit: async (events, print) => emitResult(events, print),
    async inject(what): Promise<DriverResult> {
      return tickResult(session.inject(what));
    },
    async wait() {
      /* time does not pass by itself in a headless run */
    },
    async inspect() {
      return session.inspect();
    },
  };
}
