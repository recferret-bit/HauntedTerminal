import type { KernelEvent } from './events.js';

/** One line the game terminal ran and what the session answered. A lab game keeps these for the Terminal Lab (`__lab.execLog()`). */
export interface ExecRecord {
  line: string;
  /** stdout and stderr in the order the terminal printed them. */
  output: string;
  stderr: string;
  /** Exit status of the last command of the line. */
  code?: number;
  events: KernelEvent[];
}
