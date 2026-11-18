// Capture side of the visual audit (spec .kiro/specs/qa-visual-audit/, Req 4-6). No game code change.
// A preamble seeds Math.random and turns the storm off before any page script. Then one of two clocks:
// - `stepped` (play screens): Chrome virtual time, advanced by the harness in chunks; after each chunk the stage is
//   stepped by the same time through its own dev hook and the queued rAF callbacks run once (STEPPED_RAF). Timers, game
//   ticks, the stage and rAF all follow one clock, so two runs see the same frames on any machine. CSS animations run at
//   1000x so transitions have settled by the next chunk; at the freeze, finite ones are finished and infinite ones stopped
//   at time 0.
// - `real` (hub, comix player, laptop): real time, then the frame is frozen (CSS animations at rate 0, then virtual time).
// Filmstrips: 12 frames 80 ms apart after each typed line, from a real-time screencast; the CLI records them in the
// real-time motion pass (visual-frames.mjs), because screenshots under paused virtual time can hang mid-strip.
import { launchBrowser, sleep } from './browser.mjs';
import { PAGE_DETECTORS } from './visual-detect.mjs';

export const FILM_FRAMES = 12;
/** `VISUAL_AUDIT_DEBUG=1`: print each capture phase with its real time, to find a slow or stuck step. */
const debug = process.env.VISUAL_AUDIT_DEBUG ? (...a) => console.error(`[visual-audit ${new Date().toISOString().slice(11, 23)}]`, ...a) : () => {};
export const FILM_STEP_MS = 80;

/** Stage steps are 16 ms (`window.__stage.advance`), so clock chunks and filmstrip steps are multiples of 16 ms. */
export const STEP_MS = 16;
const CHUNK_MS = 15 * STEP_MS;

/**
 * The rAF queue of the stepped clock. `window.__vaStep(ms)` is called by the harness after each virtual-time chunk: it
 * stops the stage's own loop the first time the stage exists (`window.__stage.freeze(true)`, the stage's dev hook), steps
 * the stage by exactly `ms` and renders once (`__stage.advance`), then flushes the queued rAF callbacks once (terminal,
 * overlay fitting, comix player). Stage time therefore equals virtual time, whatever the machine's speed.
 */
const STEPPED_RAF = `(() => {
  const q = new Map(); let id = 0; let frozen = false;
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
  window.__vaStep = (ms) => {
    const st = window.__stage;
    if (st && !frozen) { st.freeze(true); frozen = true; }
    if (st) { try { st.advance(ms); } catch (e) { setTimeout(() => { throw e; }); } }
    const cbs = [...q.values()]; q.clear(); const t = performance.now();
    for (const cb of cbs) { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } }
    return true;
  };
})();`;

/** Seeded Math.random (mulberry32), the storm off, the detector functions, and the rAF queue when `stepped`. */
export function preamble(seed, { stepped = false } = {}) {
  return `(() => {
  let a = ${Number(seed) >>> 0};
  Math.random = () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  try { localStorage.setItem('haunted.lab.stormOn', '0'); } catch {}
})();
${stepped ? STEPPED_RAF : ''}
${PAGE_DETECTORS}`;
}

/** Real time: sleep. */
export const realClock = () => ({ kind: 'real', start: async () => {}, opened: async () => {}, advance: (ms) => sleep(ms) });

/** Stepped virtual time: chunks of at most 240 ms of virtual time, each followed by one `__vaStep` of the same length. */
function steppedClock(b) {
  let waiter = null;
  b.on((m) => { if (m.method === 'Emulation.virtualTimeBudgetExpired' && waiter) { const w = waiter; waiter = null; w(); } });
  const budget = (ms) => withTimeout(new Promise((res) => {
    waiter = res;
    b.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: ms }).catch(() => {});
  }), 10000 + ms, 'a virtual time budget');
  return {
    kind: 'stepped',
    // Animation is enabled before navigation, so animationStarted reports the CSS animations the page starts at once.
    async start() {
      await b.send('Animation.enable');
      await b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    },
    // The playback rate belongs to the document, and Page.navigate can answer before the new document exists, so it is
    // set again before every advance; no time passes between advances, so no animation runs at another rate.
    // Note: the game opens its terminal without waiting for its web fonts, so its cell size can differ between runs when
    // IBM Plex Mono loads late (a game bug, see design.md). Forcing every face to load here made Chrome's screenshots hang.
    opened: async () => {},
    frameBudget: () => budget(STEP_MS),
    /**
     * Settle CSS animations the same way every run: a finite one (the damage flash) jumps to its end, an infinite one
     * stops at time 0. Done in the page with Web Animations, because CSS animation time moves with produced frames, and
     * under virtual time a frame is not guaranteed in a given chunk (the damage flash was caught mid-way 1 run in 3).
     */
    settleAnimations: () => b.evaluate(`(() => {
      for (const a of document.getAnimations()) {
        const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity;
        try { if (Number.isFinite(end)) a.finish(); else { a.pause(); a.currentTime = 0; } } catch {}
      }
      return true;
    })()`),
    async advance(ms) {
      await b.send('Animation.setPlaybackRate', { playbackRate: 1000 });
      let left = Math.max(STEP_MS, Math.round(ms / STEP_MS) * STEP_MS);
      while (left > 0) {
        const chunk = Math.min(CHUNK_MS, left);
        left -= chunk;
        await budget(chunk);
        await b.evaluate(`window.__vaStep ? window.__vaStep(${chunk}) : true`);
        debug('advanced', chunk);
      }
    },
  };
}

export class FreezeFailed extends Error {}

function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new FreezeFailed(`${what} did not answer within ${ms} ms`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** Console errors, page errors and failed requests, from CDP events. The Vite HMR websocket is expected and dropped. */
function watchProblems(b) {
  const out = { console: [], network: [], urls: new Map() };
  b.on((m) => {
    const p = m.params;
    if (m.method === 'Runtime.exceptionThrown') out.console.push(`page error: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
    else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) out.console.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    else if (m.method === 'Log.entryAdded' && p.entry.level === 'error' && !/^ws:/.test(p.entry.url ?? '')) out.console.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`.trim());
    else if (m.method === 'Network.requestWillBeSent') out.urls.set(p.requestId, p.request.url);
    else if (m.method === 'Network.loadingFailed' && p.type !== 'WebSocket' && !p.canceled) out.network.push({ id: p.requestId, error: p.errorText, type: p.type });
    else if (m.method === 'Network.responseReceived' && p.response.status >= 400) out.network.push({ url: p.response.url, status: p.response.status, type: p.type });
  });
  return out;
}

/**
 * Under paused virtual time Chrome only makes a frame when something on the page changed, so a screenshot of an unchanged
 * page waits forever. Before each screenshot the page toggles the opacity of a 1x1 element between 0.001 and 0.0015: a
 * compositor change no pixel shows (both round to 0 of 255). Without an answer in 15 s it is FreezeFailed (the CLI then flags capture-unstable).
 */
const NUDGE = `(() => {
  let n = document.getElementById('__va_nudge');
  if (!n) { n = document.createElement('div'); n.id = '__va_nudge'; n.setAttribute('aria-hidden', 'true'); n.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;background:#000;pointer-events:none;z-index:2147483647;opacity:0.001'; document.documentElement.appendChild(n); }
  n.style.opacity = n.style.opacity === '0.001' ? '0.0015' : '0.001';
  return true;
})()`;
const shot = async (b, fullPage, clock) => {
  debug('screenshot');
  await b.evaluate(NUDGE).catch(() => {});
  const taken = b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!fullPage });
  // On the stepped clock Chrome makes no frame while virtual time is paused: grant it one 16 ms budget (the stage is
  // frozen and only moves on __vaStep, so the picture does not change; the same 16 ms every run keeps it repeatable).
  if (clock?.frameBudget) await clock.frameBudget();
  const r = await withTimeout(taken, 15000, 'a screenshot');
  return Buffer.from(r.data, 'base64');
};

/** Check a page expression every 250 ms of the clock until it is truthy, at most `maxMs` of that clock. */
async function until(b, clock, expr, maxMs) {
  for (let t = 0; t <= maxMs; t += 250) {
    if (await b.evaluate(expr).catch(() => false)) return true;
    await clock.advance(250);
  }
  return false;
}

const IDLE = '!!(window.__term && window.__term.phase() === "play" && !window.__term.busy())';
const READY = { play: IDLE, page: 'document.readyState === "complete"' };

/**
 * One second of real-time screencast, sampled every FILM_STEP_MS: frame k is the newest frame at or before k x 80 ms
 * (a still page sends no new frames, so it repeats the last one, which is what the frozen check needs).
 */
async function filmstrip(b) {
  const got = [];
  const first = await shot(b, false);
  const t0 = Date.now();
  const onFrame = (m) => {
    if (m.method !== 'Page.screencastFrame') return;
    got.push({ at: Date.now() - t0, data: Buffer.from(m.params.data, 'base64') });
    b.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  };
  b.on(onFrame);
  await b.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(FILM_FRAMES * FILM_STEP_MS);
  await b.send('Page.stopScreencast');
  // Frame 0 is the first screencast frame when one came, so a strip never mixes the screenshot and screencast paths
  // (measured: that pair alone differed by about 20 percent and read as a jump).
  const frames = [];
  for (let k = 0; k < FILM_FRAMES; k++) {
    const at = k * FILM_STEP_MS;
    const last = got.filter((g) => g.at <= at).at(-1) ?? got[0];
    frames.push(last ? last.data : first);
  }
  return { frames, received: got.length };
}

async function pressKey(b, key) {
  const codes = { Escape: 27, Enter: 13 };
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: codes[key] ?? 0, nativeVirtualKeyCode: codes[key] ?? 0 });
}

/**
 * Run one screen's steps on `clock`: a string is a terminal line (submitted like Enter, a filmstrip when `films` is on,
 * then waited until the input is free); `{ wait }` advances the clock; `{ key }` presses a key; `{ until, max }` waits for
 * a page expression (`"stats"` and `"idle"` are shorthands). Times are game time.
 */
async function runSteps(b, clock, steps, films) {
  const strips = [];
  for (const step of steps) {
    debug('step', JSON.stringify(step).slice(0, 80));
    if (typeof step === 'string') {
      await b.evaluate(`void window.__term.submit(${JSON.stringify(step)}), true`);
      if (films) strips.push({ line: step, ...await filmstrip(b) });
      await until(b, clock, '!!(window.__term && (!window.__term.busy() || window.__term.statsOpen()))', 30000);
    } else if ('wait' in step) await clock.advance(step.wait);
    else if ('key' in step) { await pressKey(b, step.key); await clock.advance(100); }
    else if ('until' in step) {
      const expr = { stats: 'window.__term && window.__term.statsOpen()', idle: IDLE }[step.until] ?? step.until;
      await until(b, clock, expr, step.max ?? 30000);
    }
  }
  return strips;
}

/** Play screens run on the stepped clock; `"clock": "real"` in screens.json opts out. */
export const clockFor = (screen) => screen.clock ?? (screen.ready === 'play' ? 'stepped' : 'real');

/** Did the screen reach its state? `expect.events`: KernelEvent types that must be in the play event log; `expect.stats`. */
async function reached(b, expect) {
  if (!expect) return { ok: true };
  const got = await b.evaluate(`(() => ({ types: window.__game ? [...new Set(window.__game.events().map((e) => e.type))] : [], stats: !!(window.__term && window.__term.statsOpen()) }))()`).catch(() => ({ types: [], stats: false }));
  const missing = (expect.events ?? []).filter((t) => !got.types.includes(t));
  return { ok: missing.length === 0 && (!expect.stats || got.stats), missing, stats: got.stats };
}

/** Open the screen's URL on `clock` and run its steps and settle. Returns { ready, strips }. */
export async function reach(b, clock, base, screen, { films = false } = {}) {
  await clock.start();
  await b.open(base + screen.url);
  await clock.opened();
  const ready = await until(b, clock, READY[screen.ready ?? 'page'] ?? screen.ready, 45000);
  const strips = await runSteps(b, clock, screen.steps ?? [], films);
  if (films && screen.animates && strips.length === 0) strips.push({ line: '(settle)', ...await filmstrip(b) });
  await clock.advance(screen.settle ?? 1000);
  return { ready, strips };
}

/**
 * Freeze the frame. First the CSS animation playback rate goes to 0 and two screenshots must match; a page with a
 * rAF loop (the WebGL stage) still moves, so then virtual time is paused too and the pair is taken again. Measured on the
 * game: neither alone stops every pixel there, and a screenshot under paused virtual time hangs on pages with no rAF loop
 * (the hub, the laptop). Throws FreezeFailed when Chrome does not answer; `stable: false` when the pair still differs.
 */
export async function freeze(b, fullPage, clock = realClock()) {
  const pair = async () => {
    const a = await withTimeout(shot(b, fullPage, clock), 15000, 'frozen screenshot');
    await sleep(250);
    const c = await withTimeout(shot(b, fullPage, clock), 15000, 'frozen screenshot');
    return { still: a, stable: a.equals(c) };
  };
  await withTimeout(b.send('Animation.enable'), 5000, 'Animation.enable');
  if (clock.settleAnimations) await withTimeout(clock.settleAnimations(), 5000, 'settling CSS animations');
  await withTimeout(b.send('Animation.setPlaybackRate', { playbackRate: 0 }), 5000, 'animation pause');
  await sleep(200);
  const first = await pair();
  if (clock.kind === 'stepped') return { ...first, method: 'stepped' };
  if (first.stable) return { ...first, method: 'animations' };
  await withTimeout(b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' }), 5000, 'virtual time pause');
  await sleep(200);
  return { ...await pair(), method: 'animations+virtual-time' };
}

/**
 * Open each distinct page of the run once and throw it away, so the dev server has compiled the modules and the fonts
 * before the first capture. On a cold server IBM Plex Mono arrived after the terminal had opened, which changed the
 * terminal's rows (the game's font race, see design.md). Errors here are ignored: the captures report their own.
 */
export async function warmUp(base, screens) {
  const urls = [...new Set(screens.map((s) => s.url.split('?')[0]))];
  const b = await launchBrowser({ width: 1280, height: 820 });
  try {
    for (const url of urls) {
      await b.open(base + url).catch(() => {});
      await b.waitFor('document.readyState === "complete" && document.fonts.status === "loaded"', 30000, 'warm-up').catch(() => {});
      await sleep(500);
    }
  } finally {
    await b.close();
  }
}

/**
 * Capture one screen at one size. Returns the still PNG, the filmstrips, the detector data, the problems and the open
 * browser (the caller runs the font query on it, then closes it). `freezeFrame: false` is the fallback after FreezeFailed.
 */
export async function captureScreen({ base, screen, size, seed, films, page, freezeFrame = true }) {
  const [width, height] = size.split('x').map(Number);
  const b = await launchBrowser({ width, height });
  const problems = watchProblems(b);
  try {
    await b.send('Log.enable');
    await b.send('Network.enable');
    const kind = freezeFrame ? clockFor(screen) : 'real';
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: preamble(seed, { stepped: kind === 'stepped' }) });
    const clock = kind === 'stepped' ? steppedClock(b) : realClock();
    const fullPage = !!screen.fullPage;
    const { ready, strips } = await reach(b, clock, base, screen, { films });
    const frozen = freezeFrame ? await freeze(b, fullPage, clock) : { still: await shot(b, fullPage), stable: null };
    const state = await reached(b, screen.expect);
    const audit = (expr) => b.evaluate(`window.__visualAudit.${expr}`);
    const data = {
      overflow: await audit(`overflow(${JSON.stringify(page.ignoreOverflow ?? [])})`),
      boxes: await audit(`boxes(${JSON.stringify(page.selectors ?? [])})`),
      page: await audit('page()'),
      faces: await audit('fonts()'),
      marked: await audit('markText()'),
    };
    problems.network.forEach((n) => { if (n.id) { n.url = n.url ?? problems.urls.get(n.id); delete n.id; } });
    return { still: frozen.still, stable: frozen.stable, freezeMethod: frozen.method ?? 'none', clock: kind, strips, data, ready, reached: state, browser: b, problems: { console: problems.console, network: problems.network }, fullPage };
  } catch (err) {
    await b.close();
    throw err;
  }
}
