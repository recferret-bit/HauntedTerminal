// Shared helpers for the property suites (scripts/harness/props/*.mjs): running one property with the gate's seed and
// run count, printing a failure so it replays, and a fake clock for determinism checks.
// Spec: .kiro/specs/property-based-tests/.
import { Worker } from 'node:worker_threads';
import fc from 'fast-check';

export const DEFAULT_SEED = 20261117;
export const DEFAULT_RUNS = 100;

/**
 * Runs one property. `prop` is `{ name, build: () => fc.IProperty, examples? }`; `examples` are regression counterexamples
 * that always run first. A property with no generated input is `{ name, check: () => void }`: it throws to fail (used for
 * guards on the generators themselves, e.g. "random play still reaches kills and pickups").
 * Returns `{ ok, ms, runs, message }`; `message` holds the shrunk counterexample, the seed and the replay path on failure.
 */
export function runProperty(prop, { seed, runs, feature = '<feature>' }) {
  const t0 = performance.now();
  if (prop.check) {
    try {
      prop.check();
      return { ok: true, ms: performance.now() - t0, runs: 1, message: '' };
    } catch (err) {
      return { ok: false, ms: performance.now() - t0, runs: 1, message: `cause: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  const details = fc.check(prop.build(), { seed, numRuns: runs, examples: prop.examples ?? [], endOnFailure: false });
  const ms = performance.now() - t0;
  if (!details.failed) return { ok: true, ms, runs: details.numRuns, message: '' };
  const full = details.counterexample ? fc.stringify(details.counterexample) : '(none)';
  const counter = full.length > 700 ? `${full.slice(0, 700)}... (${full.length} chars)` : full;
  const cause = details.errorInstance instanceof Error ? details.errorInstance.message : String(details.errorInstance ?? 'returned false');
  const message = [
    `counterexample: ${counter}`,
    `shrunk ${details.numShrinks} time(s) after ${details.numRuns} run(s)`,
    `cause: ${cause.split('\n').slice(0, 6).join('\n       ')}`,
    `replay: node scripts/harness/property-tests.mjs --seed ${details.seed} --only ${feature}  (fast-check path ${details.counterexamplePath})`,
  ].join('\n');
  return { ok: false, ms, runs: details.numRuns, message };
}

/** Runs `fn` with `Date.now` frozen at `at` and advanced 1 ms per call, so two runs see the same clock. */
export function withFakeClock(fn, at = 1_800_000_000_000) {
  const real = Date.now;
  let now = at;
  Date.now = () => (now += 1);
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

/** Fails the property with a readable message (fast-check reports the thrown error as the cause). */
export function expect(ok, what) {
  if (!ok) throw new Error(what);
}

/** Silences console output from game code during `fn` (the sessions print sfx and debug lines in Node). */
export function quietly(fn) {
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
  console.log = console.info = console.debug = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/**
 * A hang (an endless loop in game code) would block this thread forever, and an unattended Crew session would never hear back.
 * The watchdog is a worker thread: `arm(name)` before each property; if one runs longer than `limitMs`, it prints the
 * property's name and kills the process (exit by SIGKILL, so the gate fails).
 */
export function startWatchdog(limitMs) {
  const code = `
    const { parentPort } = require('node:worker_threads');
    const { writeSync } = require('node:fs');
    let timer = null;
    parentPort.on('message', (m) => {
      clearTimeout(timer);
      if (m === null) return;
      timer = setTimeout(() => {
        writeSync(2, '\\nproperty-tests HUNG: "' + m + '" ran over ${limitMs} ms (an endless loop?). Replay it alone with --only and --runs 1.\\n');
        process.kill(process.pid, 'SIGKILL');
      }, ${limitMs});
    });`;
  const worker = new Worker(code, { eval: true });
  worker.unref();
  return { arm: (name) => worker.postMessage(name), stop: () => worker.terminate() };
}
