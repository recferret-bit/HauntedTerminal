/**
 * What a run of the player's code asks for and what it reports back. Plain data that crosses the
 * sandbox boundary (a Worker or a sandboxed iframe) as a structured-clone message.
 */
export interface CodeFiles {
  html: string;
  css: string;
  js: string;
}

export type CodeFile = keyof CodeFiles;

export const NO_FILES: CodeFiles = { html: '', css: '', js: '' };

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  text: string;
}

/** A selector to measure in the page after it ran, with the computed styles to read on its first match. */
export interface ProbeRequest {
  selector: string;
  styles: string[];
}

/** One element measured in the page. */
export interface Probe {
  count: number;
  /** `textContent` of the first match, trimmed. */
  text: string;
  styles: Record<string, string>;
}

/** Something the checker does to the page before it measures it (a click, as a user would). */
export interface PageAction {
  click: string;
}

export interface RunRequest {
  /** `script` runs JavaScript alone (a Worker, can be stopped); `page` renders html + css + js in an iframe. */
  mode: 'script' | 'page';
  files: CodeFiles;
  probes: ProbeRequest[];
  /** Expressions evaluated after the code, in its global scope (`add(2, 3)`). */
  exprs: string[];
  actions: PageAction[];
}

export interface RunReport {
  logs: LogLine[];
  /** The uncaught error, as `Name: message`, or null. */
  error: string | null;
  probes: Record<string, Probe>;
  /** Expression -> its value, formatted like the console prints it. */
  values: Record<string, string>;
  timedOut: boolean;
}

export const emptyReport = (): RunReport => ({ logs: [], error: null, probes: {}, values: {}, timedOut: false });

/** A plain run with nothing to measure: what the Run button does. */
export const plainRequest = (mode: RunRequest['mode'], files: CodeFiles): RunRequest => ({ mode, files, probes: [], exprs: [], actions: [] });
