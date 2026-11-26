// Shared helpers for the property suites (scripts/harness/props/*.mjs): running one property with the gate's seed and
// run count, printing a failure so it replays, and a fake clock for determinism checks.
// Spec: .kiro/specs/property-based-tests/.
import { Worker } from 'node:worker_threads';
import fc from 'fast-check';

export const DEFAULT_SEED = 20261117;
export const DEFAULT_RUNS = 100;

const isThenable = (v) => v !== null && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
/** Swallows a promise we refuse to await, so it never surfaces as an unhandled rejection. */
const drop = (v) => void Promise.resolve(v).catch(() => {});

/**
 * An `fc.property` whose predicate is `async` returns a Promise on every run: fast-check counts it as "returned false", and
 * the Promise, if it rejects, surfaces later as an unhandled rejection that kills the run. Wrap the predicate of fast-check's
 * sync `Property` (its `predicate` field) so the Promise is swallowed and the run fails with a readable cause.
 */
function refuseAsyncPredicate(property) {
  const inner = property?.predicate;
  if (typeof inner !== 'function') return;
  property.predicate = (v) => {
    const out = inner(v);
    if (!isThenable(out)) return out;
    drop(out);
    throw new Error('the predicate returned a Promise (an async function in fc.property); make it synchronous');
  };
}

/**
 * Runs one property. `prop` is `{ name, build: () => fc.IProperty, examples? }`; `examples` are regression counterexamples
 * that always run first. A property with no generated input is `{ name, check: () => void }`: it throws to fail (used for
 * guards on the generators themselves, e.g. "random play still reaches kills and pickups").
 * Returns `{ ok, ms, runs, message }`; `message` holds the shrunk counterexample, the seed and the replay path on failure.
 * Both are synchronous only: an `fc.asyncProperty` or an async `check()` would hand back a Promise whose failure nobody reads
 * (it would read as a pass), so either one throws instead.
 */
export function runProperty(prop, { seed, runs, feature = '<feature>' }) {
  const t0 = performance.now();
  if (prop.check) {
    let result;
    try {
      result = prop.check();
    } catch (err) {
      return { ok: false, ms: performance.now() - t0, runs: 1, message: `cause: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (isThenable(result)) {
      drop(result);
      throw new Error(`"${prop.name}": check() returned a Promise; async checks are not supported (make it synchronous)`);
    }
    return { ok: true, ms: performance.now() - t0, runs: 1, message: '' };
  }
  const property = prop.build();
  if (property?.isAsync?.()) throw new Error(`"${prop.name}": fc.asyncProperty is not supported (fc.check would return a Promise); use fc.property`);
  refuseAsyncPredicate(property);
  const details = fc.check(property, { seed, numRuns: runs, examples: prop.examples ?? [], endOnFailure: false });
  if (isThenable(details)) {
    drop(details);
    throw new Error(`"${prop.name}": fc.check returned a Promise (an async property); use a synchronous fc.property`);
  }
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

/**
 * Proves the runner cannot read a failure as a pass: an always-failing async property and an async check must throw, and an
 * always-failing sync property must come back not ok, and so must a sync property whose predicate is async (with no unhandled
 * rejection). Run at startup by property-tests.mjs; returns the problems found.
 */
export function runnerSelfCheck() {
  const opts = { seed: 1, runs: 1, feature: 'selfcheck' };
  const problems = [];
  const mustThrow = (prop) => {
    try {
      const r = runProperty(prop, opts);
      problems.push(`${prop.name} was reported ${r.ok ? 'ok' : 'failed'} instead of refused`);
    } catch (err) {
      if (!/async|Promise/.test(String(err?.message))) problems.push(`${prop.name} threw an unrelated error: ${err?.message}`);
    }
  };
  mustThrow({ name: 'always-failing fc.asyncProperty', build: () => fc.asyncProperty(fc.nat(), async () => false) });
  mustThrow({ name: 'always-failing async check', check: async () => { throw new Error('fails'); } });
  const sync = runProperty({ name: 'always-failing fc.property', build: () => fc.property(fc.nat(), () => false) }, opts);
  if (sync.ok) problems.push('an always-failing fc.property was reported ok');
  const asyncPredicate = runProperty({ name: 'fc.property with a rejecting async predicate', build: () => fc.property(fc.nat(), async () => { throw new Error('fails'); }) }, opts);
  if (asyncPredicate.ok || !/Promise/.test(asyncPredicate.message)) problems.push('an fc.property with an async predicate was not failed with its cause');
  return problems;
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

/**
 * A tiny DOM for UI checks (the Esc menu): nodes, capture / target / bubble events, focus (fires `focusin`), `hidden`, and
 * timers that run only when `flush()` is called. `install()` sets the globals the menu uses; `uninstall()` restores them.
 */
export function fakeDom() {
  let nextTimerId = 1;
  const timers = new Map();
  const intervals = new Map();
  const matches = (el, sel) => sel.split(/(?=[.#])/).every((part) => {
    if (!part) return true;
    if (part.startsWith('#')) return el.id === part.slice(1);
    if (part.startsWith('.')) return el.classList?.contains(part.slice(1));
    return el.tagName === part.toUpperCase();
  });
  const queryAll = (root, sel, out = []) => {
    for (const c of root.children ?? []) {
      if (matches(c, sel)) out.push(c);
      queryAll(c, sel, out);
    }
    return out;
  };
  const make = (tag) => {
    let text = null;
    const classes = new Set();
    const attrs = new Map();
    const node = {
      tagName: tag.toUpperCase(), children: [], parentNode: null, dataset: {}, style: {}, offsetWidth: 0,
      hidden: false, disabled: false, value: '', id: '', title: '', onclick: null, listeners: new Map(),
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) classes.add(c); },
      classList: { add: (...xs) => xs.forEach((x) => classes.add(x)), remove: (...xs) => xs.forEach((x) => classes.delete(x)), contains: (x) => classes.has(x),
        toggle: (x, force) => { const on = force === undefined ? !classes.has(x) : !!force; if (on) classes.add(x); else classes.delete(x); return on; } },
      setAttribute: (k, v) => void attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      append: (...xs) => xs.forEach((x) => node.appendChild(typeof x === 'string' ? { textContent: x, parentNode: null, children: [] } : x)),
      appendChild: (x) => { x.parentNode = node; node.children.push(x); text = null; return x; },
      remove: () => { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node); node.parentNode = null; },
      replaceChildren: (...xs) => { node.children = []; node.append(...xs); },
      querySelector: (sel) => queryAll(node, sel)[0] ?? null,
      querySelectorAll: (sel) => queryAll(node, sel),
      get textContent() { return text ?? node.children.map((c) => c.textContent).join(''); },
      set textContent(v) { node.children = []; text = String(v); },
      addEventListener: (type, fn, capture) => void node.listeners.set(type, [...(node.listeners.get(type) ?? []), { fn, capture: !!capture }]),
      removeEventListener: (type, fn, capture) => void node.listeners.set(type, (node.listeners.get(type) ?? []).filter((l) => l.fn !== fn || l.capture !== !!capture)),
      focus: () => { doc.activeElement = node; fire(node, { type: 'focusin' }); },
      click: () => { node.onclick?.(); fire(node, { type: 'click' }); },
    };
    return node;
  };
  const doc = make('#document');
  doc.createElement = make;
  doc.body = doc.appendChild(make('body'));
  doc.activeElement = doc.body;
  const fire = (target, ev) => {
    const e = {
      ...ev, target, defaultPrevented: false, stopped: false, immediate: false,
      preventDefault() { e.defaultPrevented = true; },
      stopPropagation() { e.stopped = true; },
      stopImmediatePropagation() { e.stopped = e.immediate = true; },
    };
    const path = [];
    for (let n = target; n; n = n.parentNode) path.unshift(n);
    const run = (n, capture) => {
      for (const l of [...(n.listeners.get(e.type) ?? [])]) if (!e.immediate && (capture === null || l.capture === capture)) l.fn(e);
    };
    for (const n of path.slice(0, -1)) if (!e.stopped) run(n, true);
    if (!e.stopped) run(target, null);
    for (const n of path.slice(0, -1).reverse()) if (!e.stopped) run(n, false);
    return e;
  };
  const find = (root, id) => (root.id === id ? root : root.children.reduce((hit, c) => hit ?? find(c, id), null));
  const saved = {};
  return {
    doc, make, fire, find: (id) => find(doc, id),
    flush: () => {
      while (timers.size > 0) {
        const [id, fn] = timers.entries().next().value;
        timers.delete(id);
        fn();
      }
    },
    install() {
      saved.document = globalThis.document;
      saved.setTimeout = globalThis.setTimeout;
      saved.clearTimeout = globalThis.clearTimeout;
      saved.setInterval = globalThis.setInterval;
      saved.clearInterval = globalThis.clearInterval;
      globalThis.document = doc;
      globalThis.setTimeout = (fn) => {
        const id = nextTimerId++;
        timers.set(id, fn);
        return id;
      };
      globalThis.clearTimeout = (id) => {
        timers.delete(id);
      };
      globalThis.setInterval = (fn) => {
        const id = nextTimerId++;
        intervals.set(id, fn);
        return id;
      };
      globalThis.clearInterval = (id) => {
        intervals.delete(id);
      };
    },
    uninstall() {
      timers.clear();
      intervals.clear();
      if (saved.document === undefined) delete globalThis.document;
      else globalThis.document = saved.document;
      globalThis.setTimeout = saved.setTimeout;
      globalThis.clearTimeout = saved.clearTimeout;
      globalThis.setInterval = saved.setInterval;
      globalThis.clearInterval = saved.clearInterval;
    },
  };
}
