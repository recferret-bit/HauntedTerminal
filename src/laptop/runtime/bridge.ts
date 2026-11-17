/**
 * The JavaScript that runs next to the player's code inside the sandbox (a Worker or a sandboxed
 * iframe): it turns console calls and uncaught errors into messages, and measures the page for checks.
 * Kept as source text because it executes in another realm; `post` is how that realm talks back.
 */
import type { RunRequest } from '../domain/run.js';
import { guardHtmlScripts, guardLoops } from './loop-guard.js';

/** How long timers in the player's code get to print before the run is reported. */
export const SETTLE_MS = 120;

/** How long one task of page code may loop before `__lg` stops it (loop-guard.ts inserts the calls). */
export const LOOP_BUDGET_MS = 1000;

/**
 * The loop check: the first call in a task notes the time and schedules a reset for the next task, so
 * every event handler gets a fresh budget. Past the budget it throws, which ends the loop.
 */
const LOOP_CHECK = `(() => {
  let start = 0;
  self.__lg = (line) => {
    const now = performance.now();
    if (!start) { start = now; setTimeout(() => { start = 0; }, 0); return true; }
    if (now - start > ${LOOP_BUDGET_MS}) throw new RangeError('the loop on line ' + line + ' ran for over ${LOOP_BUDGET_MS / 1000} s, so it was stopped');
    return true;
  };
})();`;

/** Console capture and error reporting. `post` is an expression that sends one message. */
function bridge(post: string): string {
  return `(() => {
  const send = (m) => ${post};
  const fmt = (v, depth = 0) => {
    if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'function ' + (v.name || '(anonymous)') + '()';
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (typeof v !== 'object' || v === null) return String(v);
    if (depth > 2) return Array.isArray(v) ? '[...]' : '{...}';
    if (Array.isArray(v)) return '[' + v.map((x) => fmt(x, depth + 1)).join(', ') + ']';
    if (typeof Element !== 'undefined' && v instanceof Element) return '<' + v.tagName.toLowerCase() + '>';
    return '{ ' + Object.keys(v).map((k) => k + ': ' + fmt(v[k], depth + 1)).join(', ') + ' }';
  };
  self.__fmt = fmt;
  self.__send = send;
  for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => send({ t: 'log', level, text: args.map((a) => fmt(a)).join(' ') });
  }
  self.addEventListener('error', (e) => send({ t: 'error', text: e.error ? fmt(e.error) : String(e.message) }));
  self.addEventListener('unhandledrejection', (e) => send({ t: 'error', text: 'Uncaught (in promise) ' + fmt(e.reason) }));
})();`;
}

/** Statements that evaluate the check expressions in the code's global scope into `values`. */
function evalExprs(exprs: readonly string[]): string {
  return `const values = {};
  for (const x of ${JSON.stringify(exprs)}) {
    try { values[x] = self.__fmt((0, eval)(x), 1); } catch (e) { values[x] = self.__fmt(e); }
  }`;
}

/** Worker source: the bridge, the code through indirect eval (so its functions become globals), then the expressions. */
export function workerSource(req: RunRequest): string {
  return `${bridge('self.postMessage(m)')}
try { (0, eval)(${JSON.stringify(req.files.js)}); } catch (e) { self.__send({ t: 'error', text: self.__fmt(e) }); }
setTimeout(() => {
  ${evalExprs(req.exprs)}
  self.__send({ t: 'done', probes: {}, values });
}, ${SETTLE_MS});`;
}

/** Text that may sit inside a <script> or <style> element without closing it. */
const inert = (text: string, tag: 'script' | 'style'): string => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/** iframe document: bridge and loop check first, the player's CSS, HTML and (loop-guarded) JS, then the probe that clicks, measures and reports. */
export function pageSource(req: RunRequest, token: string): string {
  const probe = `addEventListener('load', () => setTimeout(() => {
  for (const a of ${JSON.stringify(req.actions)}) document.querySelector(a.click)?.click();
  setTimeout(() => {
    const probes = {};
    for (const p of ${JSON.stringify(req.probes)}) {
      const all = document.querySelectorAll(p.selector);
      const first = all[0];
      const styles = {};
      if (first) { const cs = getComputedStyle(first); for (const s of p.styles) styles[s] = cs.getPropertyValue(s); }
      probes[p.selector] = { count: all.length, text: first ? first.textContent.trim() : '', styles };
    }
    ${evalExprs(req.exprs)}
    self.__send({ t: 'done', probes, values });
  }, 60);
}, ${SETTLE_MS}));`;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<script>${bridge(`parent.postMessage(Object.assign({ token: ${JSON.stringify(token)} }, m), '*')`)}\n${LOOP_CHECK}</script>`,
    `<style>${inert(req.files.css, 'style')}</style></head><body>`,
    guardHtmlScripts(req.files.html),
    `<script>${inert(guardLoops(req.files.js), 'script')}</script>`,
    `<script>${probe}</script>`,
    '</body></html>',
  ].join('\n');
}
