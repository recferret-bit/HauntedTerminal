import { sleep } from '../editor-core/dom.js';
import type { LabFrame } from './lab-frame.js';
import { emitResult, tickResult, type DriverResult, type LabDriver } from './runner.js';

const POLL_MS = 25;
const LINE_TIMEOUT_MS = 20_000;

/**
 * Drives the real game in the iframe: lines go through the terminal exactly as Enter does (echo, stage, HUD),
 * ticks through the game's own tick path, and what the session answered is read from `__lab.execLog()`.
 */
export function createFrameDriver(frame: LabFrame, reload: () => Promise<void>): LabDriver {
  const play = frame.shell.play;
  const lab = () => {
    const api = frame.api;
    if (!api) throw new Error('the lab game is not running');
    return api;
  };
  return {
    reset: reload,
    async run(line): Promise<DriverResult> {
      const seen = lab().execLog().count;
      const seq = lab().seq();
      const page = play.win?.__term;
      play.submit(line);
      const until = Date.now() + LINE_TIMEOUT_MS;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        if (play.win?.__term !== page || lab().seq() !== seq) throw new Error('the game was reloaded while the line ran');
        const log = lab().execLog();
        if (log.count > seen && !page?.busy()) {
          const e = log.entries[log.entries.length - (log.count - seen)]!;
          return { output: e.output, stderr: e.stderr, code: e.code, events: e.events };
        }
      }
      throw new Error(`the terminal did not finish "${line}"`);
    },
    async tick(): Promise<DriverResult> {
      return tickResult(lab().tick());
    },
    async emit(events, print): Promise<DriverResult> {
      for (const ev of events) play.emit(ev);
      if (print) play.print(print.replace(/\n/g, '\r\n'));
      return emitResult(events, print);
    },
    async inject(what): Promise<DriverResult> {
      return tickResult(lab().inject(what));
    },
    wait: sleep,
    async inspect() {
      return lab().inspect();
    },
  };
}
