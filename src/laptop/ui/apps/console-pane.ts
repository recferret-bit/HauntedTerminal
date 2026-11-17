/** The output pane under a code editor: console lines, coloured by level, plus one status line. */
import { h } from '../../../editor-core/dom.js';
import type { LogLine, RunReport } from '../../domain/run.js';

export interface ConsolePane {
  el: HTMLElement;
  clear(): void;
  add(line: LogLine): void;
  /** The closing status of a run: OK, the error, or the timeout. */
  finish(report: RunReport): void;
}

export function createConsolePane(): ConsolePane {
  const list = h('div', { class: 'lt-console', role: 'log', 'aria-label': 'Console' });
  const add = (line: LogLine): void => {
    list.append(h('div', { class: `lt-log ${line.level}` }, line.text));
    list.scrollTop = list.scrollHeight;
  };
  return {
    el: list,
    clear: () => list.replaceChildren(),
    add,
    finish(report) {
      const status = report.timedOut ? 'stopped: it ran too long (an endless loop?)' : report.error ? 'finished with an error' : 'finished OK';
      list.append(h('div', { class: `lt-log status${report.error || report.timedOut ? ' bad' : ''}` }, `-- ${status}`));
      list.scrollTop = list.scrollHeight;
    },
  };
}
