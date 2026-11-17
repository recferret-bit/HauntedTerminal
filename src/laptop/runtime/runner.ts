/**
 * Runs the player's code for real and reports what happened. JavaScript alone runs in a Worker (it can
 * be stopped, so an endless loop only times out); a page runs in a sandboxed iframe with an opaque
 * origin (`sandbox="allow-scripts"`), so the code cannot reach this page, its storage or its cookies.
 * Page loops are guarded (loop-guard.ts); a page that still does not report gets a fresh, stopped preview.
 */
import { emptyReport, NO_FILES, plainRequest, type LogLine, type RunReport, type RunRequest } from '../domain/run.js';
import { pageSource, workerSource } from './bridge.js';

/** A run that has not reported by then is stopped and reported as timed out. */
export const RUN_TIMEOUT_MS = 2500;

type BridgeMessage =
  | { t: 'log'; level: LogLine['level']; text: string }
  | { t: 'error'; text: string }
  | { t: 'done'; probes: RunReport['probes']; values: RunReport['values'] };

/** Folds bridge messages into a report and settles once: on `done` or on the timeout. */
function collector(
  onLog: ((line: LogLine) => void) | undefined,
  stop: (timedOut: boolean) => void,
  limitMs = RUN_TIMEOUT_MS,
): { feed: (m: BridgeMessage) => void; result: Promise<RunReport>; cancel: () => void } {
  const report = emptyReport();
  let settle!: (r: RunReport) => void;
  const result = new Promise<RunReport>((res) => { settle = res; });
  let open = true;
  const finish = (): void => {
    if (!open) return;
    open = false;
    window.clearTimeout(timer);
    stop(report.timedOut);
    settle(report);
  };
  const timer = window.setTimeout(() => { report.timedOut = true; finish(); }, limitMs);
  const cancel = (): void => {
    if (!open) return;
    open = false;
    window.clearTimeout(timer);
    settle(report);
  };
  const feed = (m: BridgeMessage): void => {
    if (!open) return;
    if (m.t === 'log') {
      const line = { level: m.level, text: m.text };
      report.logs.push(line);
      onLog?.(line);
    } else if (m.t === 'error') {
      report.error ??= m.text;
      onLog?.({ level: 'error', text: m.text });
    } else {
      report.probes = m.probes;
      report.values = m.values;
      finish();
    }
  };
  return { feed, result, cancel };
}

function runScript(req: RunRequest, onLog?: (line: LogLine) => void): Promise<RunReport> {
  const url = URL.createObjectURL(new Blob([workerSource(req)], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const { feed, result } = collector(onLog, () => { worker.terminate(); URL.revokeObjectURL(url); });
  worker.onmessage = (ev: MessageEvent<BridgeMessage>) => feed(ev.data);
  worker.onerror = (ev) => { ev.preventDefault(); feed({ t: 'error', text: ev.message }); };
  return result;
}

let runs = 0;

const STOPPED_PAGE = '<!doctype html><body style="font:14px monospace;padding:12px;color:#ef233c">stopped: the page ran too long. Fix the code and run it again.</body>';

/**
 * Where a page shows. A page that hangs keeps its iframe's thread busy, so a timed-out run swaps in a
 * fresh iframe (dropping the stuck one) and the slot points at the new element.
 */
export interface PreviewSlot {
  frame: HTMLIFrameElement;
  cancel?: () => void;
}

/** Renders the page into the slot's frame (the visible preview) and reports from inside it. */
function renderPage(req: RunRequest, slot: PreviewSlot, onLog: ((line: LogLine) => void) | undefined, limitMs: number): Promise<RunReport> {
  slot.cancel?.();
  const frame = slot.frame;
  const token = `run-${++runs}-${Math.random().toString(36).slice(2)}`;
  let cancelled = false;
  const listen = (ev: MessageEvent): void => {
    if (cancelled) return;
    const data = ev.data as (BridgeMessage & { token?: string }) | null;
    if (ev.source === frame.contentWindow && data?.token === token) feed(data);
  };
  const { feed, result, cancel } = collector(onLog, (timedOut) => {
    window.removeEventListener('message', listen);
    if (!timedOut || cancelled) return;
    // Drop the stuck frame: a fresh one says it was stopped.
    const fresh = frame.cloneNode(false) as HTMLIFrameElement;
    fresh.srcdoc = STOPPED_PAGE;
    frame.replaceWith(fresh);
    slot.frame = fresh;
  }, limitMs);
  slot.cancel = () => {
    cancelled = true;
    window.removeEventListener('message', listen);
    cancel();
  };
  window.addEventListener('message', listen);
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.srcdoc = pageSource(req, token);
  return result;
}

/** Set by a page run that timed out: sandboxed frames share a process, which stays busy for a few seconds after a hang. */
let hung = false;
/** Up to 30 s of one-second pings: a stuck sandbox process takes 10 to 15 s to let go in Chrome. */
const RECOVER_TRIES = 30;
const RECOVER_PING_MS = 1000;

/** Waits until a blank page answers again, so the next run is not judged on a process that is still stuck. */
async function recover(slot: PreviewSlot, onLog?: (line: LogLine) => void): Promise<void> {
  onLog?.({ level: 'info', text: 'restarting the preview after the stopped page...' });
  const ping = plainRequest('page', NO_FILES);
  for (let i = 0; i < RECOVER_TRIES && hung; i++) hung = (await renderPage(ping, slot, undefined, RECOVER_PING_MS)).timedOut;
  hung = false;
}

async function runPage(req: RunRequest, slot: PreviewSlot, onLog?: (line: LogLine) => void): Promise<RunReport> {
  if (hung) await recover(slot, onLog);
  const report = await renderPage(req, slot, onLog, RUN_TIMEOUT_MS);
  hung = report.timedOut;
  return report;
}

/** One run. A preview slot is required for pages: it is where the page shows. */
export function runCode(req: RunRequest, preview: PreviewSlot | null, onLog?: (line: LogLine) => void): Promise<RunReport> {
  if (req.mode === 'script') return runScript(req, onLog);
  if (!preview) return Promise.reject(new Error('a page run needs a preview frame'));
  return runPage(req, preview, onLog);
}
