/**
 * Task checks: plain data judged against a `RunReport` by pure functions. `requestFor` turns a task's
 * checks into what the sandbox must measure, `judge` decides each check. Deterministic, no LLM.
 */
import type { CodeFile, CodeFiles, PageAction, ProbeRequest, RunReport, RunRequest } from './run.js';

export type Check =
  /** Some console line equals `equals` (trimmed) or contains `includes`. */
  | { kind: 'log'; equals?: string; includes?: string; label: string }
  /** The console printed exactly these lines, in order. */
  | { kind: 'logs'; lines: string[]; label: string }
  /** The code ran without an uncaught error. */
  | { kind: 'noError'; label: string }
  /** An expression evaluated after the code prints as `equals`. */
  | { kind: 'value'; expr: string; equals: string; label: string }
  /** At least `min` (default 1) elements match; the first one's text contains `text`. */
  | { kind: 'element'; selector: string; min?: number; text?: string; label: string }
  /** The first match's computed style `prop` equals `equals` (as the browser reports it: `rgb(255, 106, 19)`). */
  | { kind: 'style'; selector: string; prop: string; equals: string; label: string }
  /** The source of one file contains a snippet (case-insensitive): "use a for loop". */
  | { kind: 'source'; file: CodeFile; includes: string; label: string };

export interface CheckResult {
  label: string;
  ok: boolean;
  /** What was found, for the failure line. */
  detail: string;
}

/** Everything the sandbox has to measure for these checks, merged per selector. */
export function requestFor(mode: RunRequest['mode'], files: CodeFiles, checks: readonly Check[], actions: readonly PageAction[] = []): RunRequest {
  const probes = new Map<string, Set<string>>();
  const exprs: string[] = [];
  for (const c of checks) {
    if (c.kind === 'element' || c.kind === 'style') {
      const styles = probes.get(c.selector) ?? new Set<string>();
      if (c.kind === 'style') styles.add(c.prop);
      probes.set(c.selector, styles);
    } else if (c.kind === 'value' && !exprs.includes(c.expr)) exprs.push(c.expr);
  }
  const list: ProbeRequest[] = [...probes].map(([selector, styles]) => ({ selector, styles: [...styles] }));
  return { mode, files, probes: list, exprs, actions: [...actions] };
}

const quote = (s: string): string => JSON.stringify(s.length > 60 ? `${s.slice(0, 57)}...` : s);

function judgeOne(c: Check, report: RunReport, files: CodeFiles): { ok: boolean; detail: string } {
  const lines = report.logs.map((l) => l.text.trim());
  switch (c.kind) {
    case 'log': {
      const ok = lines.some((t) => (c.equals !== undefined ? t === c.equals.trim() : t.includes(c.includes ?? '')));
      return { ok, detail: lines.length ? `console: ${lines.slice(0, 4).map(quote).join(', ')}` : 'the console is empty' };
    }
    case 'logs': {
      const ok = lines.length === c.lines.length && c.lines.every((l, i) => lines[i] === l.trim());
      return { ok, detail: `printed ${lines.length} line(s), want ${c.lines.length}` };
    }
    case 'noError':
      return { ok: !report.error && !report.timedOut, detail: report.timedOut ? 'it never finished (an endless loop?)' : report.error ?? '' };
    case 'value': {
      const got = report.values[c.expr];
      return { ok: got === c.equals, detail: got === undefined ? `${c.expr} could not run` : `${c.expr} is ${got}` };
    }
    case 'element': {
      const p = report.probes[c.selector];
      const min = c.min ?? 1;
      const ok = !!p && p.count >= min && (c.text === undefined || p.text.includes(c.text));
      return { ok, detail: p ? `${p.count} x ${c.selector}${p.count ? `, text ${quote(p.text)}` : ''}` : `no ${c.selector}` };
    }
    case 'style': {
      const got = report.probes[c.selector]?.styles[c.prop];
      return { ok: got === c.equals, detail: got === undefined ? `no ${c.selector}` : `${c.prop} is ${got}` };
    }
    case 'source': {
      const ok = files[c.file].toLowerCase().includes(c.includes.toLowerCase());
      return { ok, detail: ok ? '' : `the ${c.file.toUpperCase()} has no ${quote(c.includes)}` };
    }
  }
}

export function judge(checks: readonly Check[], report: RunReport, files: CodeFiles): CheckResult[] {
  return checks.map((c) => ({ label: c.label, ...judgeOne(c, report, files) }));
}

export const allPassed = (results: readonly CheckResult[]): boolean => results.length > 0 && results.every((r) => r.ok);
