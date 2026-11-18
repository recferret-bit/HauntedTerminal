// Real-time motion pass of the visual audit (spec .kiro/specs/qa-visual-audit/, Req 6, 7, 13): one browser per screen,
// real time, no virtual clock. It reaches the screen like a player (filmstrips of 12 screencast frames after each typed
// line, or after the settle time on an animated screen), then throttles the CPU and samples rAF intervals.
// Virtual time hides real cost and can hang screenshots mid-strip, so motion is recorded here, apart from the stills.
import { launchBrowser } from './browser.mjs';
import { preamble, reach, realClock } from './visual-capture.mjs';

export const THROTTLE_RATE = 4;
export const SAMPLE_MS = 2000;
const LONG_FRAME_MS = 2 * 16.7;
export const MAX_LONG_SHARE = 0.1;

const SAMPLE = `new Promise((done) => {
  const gaps = []; let last = 0; const t0 = performance.now();
  const step = (t) => { if (last) gaps.push(t - last); last = t; if (t - t0 < ${SAMPLE_MS}) requestAnimationFrame(step); else done(gaps); };
  requestAnimationFrame(step);
})`;

/** Summary of rAF gaps: frame count, long frames (> 2 frames of 60 Hz), share, worst and median gap. */
export function frameStats(gaps) {
  const sorted = [...gaps].sort((a, b) => a - b);
  const long = gaps.filter((g) => g > LONG_FRAME_MS).length;
  const r = (x) => Math.round(x * 10) / 10;
  return { frames: gaps.length, long, longShare: gaps.length ? r((long / gaps.length) * 100) / 100 : 1, worstMs: r(sorted.at(-1) ?? 0), medianMs: r(sorted[Math.floor(sorted.length / 2)] ?? 0) };
}

/**
 * Reach the screen in real time with filmstrips on, then (unless `sample` is false) throttle the CPU and sample rAF for
 * SAMPLE_MS. Returns { strips, stats, flags }; `strips` are { line, frames: PNG buffers, received }.
 */
export async function probeMotion({ base, screen, seed, size = '1280x820', films = true, sample = true }) {
  const [width, height] = size.split('x').map(Number);
  const b = await launchBrowser({ width, height });
  try {
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: preamble(seed) });
    const { strips } = await reach(b, realClock(), base, screen, { films });
    if (!sample) return { strips, stats: null, flags: [] };
    await b.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE_RATE });
    const gaps = await b.evaluate(SAMPLE, SAMPLE_MS + 15000);
    await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const stats = frameStats(gaps);
    const flags = stats.longShare > MAX_LONG_SHARE ? [{ kind: 'dropped-frames', throttle: THROTTLE_RATE, ...stats }] : [];
    return { strips, stats, flags };
  } finally {
    await b.close();
  }
}
