import { h } from '../../editor-core/dom.js';
import { APPS } from '../domain/apps.js';
import { allPassed } from '../domain/checks.js';
import { TASKS, taskById } from '../domain/tasks.js';
import type { WorkbenchInspectEvent } from '../ui/apps/app-types.js';
import type { LaptopHandle } from '../ui/laptop.js';

export interface InspectorController {
  el: HTMLElement;
  update(ev: WorkbenchInspectEvent): void;
}

function statusOf(ev: WorkbenchInspectEvent | null): { cls: string; text: string } {
  if (!ev) return { cls: 'idle', text: 'IDLE' };
  if (ev.report?.timedOut) return { cls: 'fail', text: 'LOOP GUARD' };
  if (ev.report?.error) return { cls: 'fail', text: 'ERROR' };
  if (ev.checks?.length) return allPassed(ev.checks) ? { cls: 'pass', text: 'PASS' } : { cls: 'fail', text: 'FAIL' };
  if (ev.report) return { cls: 'run', text: 'RAN' };
  return { cls: 'idle', text: 'LOADED' };
}

/** Quest Check & RunReport Inspector card for /laptop-lab's side dock. */
export function createInspectorCard(lt: () => LaptopHandle): InspectorController {
  const header = h('div', { class: 'll-insp-head' });
  const badge = h('span', { class: 'll-badge idle' }, 'IDLE');
  const title = h('b', { class: 'll-insp-title' }, 'No quest run yet');
  header.append(title, badge);

  const summary = h('div', { class: 'll-kv' }, 'Run or Check any quest (or edit code)');
  const errBox = h('pre', { class: 'll-insp-err', hidden: true });
  const logsList = h('ul', { class: 'll-insp-logs' });
  const checksList = h('ul', { class: 'll-insp-checks' });

  let lastTaskId: string = TASKS[0]!.id;

  const runQuick = (which: 'starter' | 'solution'): void => {
    const task = taskById(lastTaskId);
    if (!task) return;
    lt().jump('desktop');
    void lt().runTask(task.id, task[which]);
  };

  const actions = h(
    'div',
    { class: 'll-actions' },
    h('button', { type: 'button', class: 'btn small', 'data-insp': 'starter', onclick: () => runQuick('starter') }, 'Test starter'),
    h('button', { type: 'button', class: 'btn small', 'data-insp': 'solution', onclick: () => runQuick('solution') }, 'Test solution'),
  );

  const update = (ev: WorkbenchInspectEvent): void => {
    if (ev.taskId) lastTaskId = ev.taskId;
    const badgeInfo = statusOf(ev);
    badge.className = `ll-badge ${badgeInfo.cls}`;
    badge.textContent = badgeInfo.text;
    title.textContent = ev.taskId ? `${ev.taskId} · ${APPS[ev.app].title}` : `${APPS[ev.app].title} (scratch)`;

    const r = ev.report;
    if (!r) {
      summary.textContent = `${ev.mode} · awaiting run`;
      errBox.hidden = true;
      errBox.textContent = '';
      logsList.replaceChildren();
    } else {
      const probeCount = Object.keys(r.probes).length;
      const valCount = Object.keys(r.values).length;
      summary.textContent = `${ev.mode} · logs ${r.logs.length} · probes ${probeCount} · vals ${valCount}${r.timedOut ? ' · timedOut' : ''}`;
      if (r.error || r.timedOut) {
        errBox.hidden = false;
        errBox.textContent = r.error ?? 'Loop guard timed out';
      } else {
        errBox.hidden = true;
        errBox.textContent = '';
      }
      logsList.replaceChildren(
        ...r.logs.slice(-6).map((l) => h('li', { class: `ll-log-${l.level}` }, `[${l.level}] ${l.text}`)),
      );
    }

    const checks = ev.checks ?? [];
    checksList.replaceChildren(
      ...checks.map((c) => {
        const stateText = c.ok ? 'PASS' : 'FAIL';
        const suffix = c.ok || !c.detail ? '' : `: ${c.detail}`;
        return h('li', { class: c.ok ? 'ok' : 'bad' }, `${stateText} · ${c.label}${suffix}`);
      }),
    );
  };

  const el = h(
    'section',
    { class: 'll-box ll-inspector', 'aria-label': 'Quest Check and RunReport Inspector' },
    h('h3', {}, 'Quest & RunReport Inspector'),
    header,
    summary,
    errBox,
    checksList,
    logsList,
    actions,
  );
  return { el, update };
}
