/**
 * /laptop-lab: a test bench for the laptop, the way /terminal-lab is one for the terminal. The laptop
 * sits in a comic panel; the side panel shows the lifecycle machine (and sends its events), the live
 * input mirror and the quests. URL: `?state=<state>` starts there, `?speed=0|0.5|1`, `?mute=1`.
 */
import { startPageAudio } from '../../audio/page.js';
import { h } from '../../editor-core/dom.js';
import { APPS } from '../domain/apps.js';
import { LAPTOP_STATES, userEvents, type LaptopEvent, type LaptopState } from '../domain/machine.js';
import { TASKS } from '../domain/tasks.js';
import { laptopHear } from '../app-bus.js';
import { mountLaptop, type LaptopHandle } from '../ui/laptop.js';

const EVENT_LABEL: Record<Exclude<LaptopEvent, 'DONE'>, string> = { OPEN: 'Open the lid', CLOSE: 'Close the lid', POWER: 'Power' };

const CAPTION: Record<LaptopState, string> = {
  closed: 'His old laptop, shut. Click the lid (or Open) to crack it open.',
  opening: 'The hinge creaks...',
  open: 'The screen is dark. Click it (or Power) and dive in.',
  diving: 'Down into the screen...',
  booting: 'It still boots. Barely.',
  desktop: 'HAUNTED/OS. Type on your keyboard, move your mouse: the laptop feels it.',
  shutting: 'Saving nothing. Shutting down.',
  surfacing: 'Back out of the screen.',
  closing: 'Lid down.',
};

function section(title: string, ...body: HTMLElement[]): HTMLElement {
  return h('section', { class: 'll-box' }, h('h3', {}, title), ...body);
}

function machineBox(lt: LaptopHandle): HTMLElement {
  const now = h('div', { class: 'll-state' });
  const chips = h('div', { class: 'll-chips' }, ...LAPTOP_STATES.map((s) => h('span', { class: 'll-chip', 'data-state': s }, s)));
  const actions = h('div', { class: 'll-actions' });
  const speed = h('select', { 'aria-label': 'Animation speed' },
    ...[['1', 'Speed 1x'], ['0.4', 'Slow motion'], ['0', 'Instant']].map(([v, l]) => h('option', { value: v }, l)));
  speed.value = String(lt.machine.speed);
  speed.addEventListener('change', () => lt.setSpeed(Number(speed.value)));
  const draw = (state: LaptopState): void => {
    now.textContent = state.toUpperCase();
    chips.querySelectorAll<HTMLElement>('.ll-chip').forEach((c) => c.classList.toggle('on', c.dataset.state === state));
    const buttons = userEvents(state).map((ev) => h('button', { class: 'btn primary', 'data-event': ev, onclick: () => lt.machine.send(ev) }, EVENT_LABEL[ev as Exclude<LaptopEvent, 'DONE'>]));
    if (state !== 'desktop') buttons.push(h('button', { class: 'btn', onclick: () => lt.jump('desktop') }, 'Skip to desktop'));
    actions.replaceChildren(...buttons);
  };
  draw(lt.machine.state);
  lt.onState((s) => draw(s));
  return section('Machine', now, chips, actions, speed);
}

function inputBox(lt: LaptopHandle): HTMLElement {
  const keyLine = h('div', { class: 'll-kv' });
  const heldLine = h('div', { class: 'll-kv' });
  const padLine = h('div', { class: 'll-kv' });
  const draw = (code = ''): void => {
    if (code) keyLine.textContent = `last key   ${code}`;
    heldLine.textContent = `deck keys  ${lt.view.keyboard.pressed().join(' ') || '-'}`;
    const p = lt.view.trackpad.state();
    padLine.textContent = `trackpad   ${p.touching ? `${p.u.toFixed(2)}, ${p.v.toFixed(2)}` : 'lifted'}${p.buttons.length ? `  [${p.buttons.map((b) => (b === 2 ? 'R' : 'L')).join('')}]` : ''}`;
  };
  keyLine.textContent = 'last key   -';
  window.addEventListener('keydown', (ev) => draw(ev.code));
  window.addEventListener('keyup', () => draw());
  for (const ev of ['pointermove', 'pointerdown', 'pointerup']) window.addEventListener(ev, () => draw());
  draw();
  return section('Input', keyLine, heldLine, padLine, h('p', { class: 'll-note' }, 'Your real keys press the deck keys; your mouse over the screen moves the finger on the trackpad, and clicks press its buttons.'));
}

function questBox(lt: LaptopHandle): HTMLElement {
  const head = h('div', { class: 'll-kv' });
  const list = h('ul', { class: 'll-quests' });
  const draw = (): void => {
    const done = lt.ctx.progress().done;
    head.textContent = `${done.length} / ${TASKS.length} solved`;
    list.replaceChildren(...TASKS.map((t) => h('li', { class: done.includes(t.id) ? 'done' : '' },
      h('button', { class: 'll-link', 'data-task': t.id, onclick: () => { lt.jump('desktop'); lt.ctx.startTask(t.id); } }, `${done.includes(t.id) ? '[x]' : '[ ]'} ${t.title}`),
      h('small', {}, APPS[t.app].title))));
  };
  draw();
  lt.ctx.onProgress(draw);
  return section('Quests', head, list, h('button', { class: 'btn small', onclick: () => lt.resetProgress() }, 'Reset progress'));
}

function soundBox(lt: LaptopHandle, onMute: (muted: boolean) => void, onUnmuted: () => void): HTMLElement {
  const box = h('input', { id: 'll-sound', type: 'checkbox', 'aria-label': 'Sound' });
  box.checked = !lt.ctx.sound.muted;
  box.addEventListener('change', () => {
    const muted = !box.checked;
    lt.ctx.sound.muted = muted;
    onMute(muted);
    if (!muted) onUnmuted();
  });
  return section('Sound', h('label', { class: 'll-kv' }, box, ' key clicks, beeps, disk'));
}

export function startLaptopLab(root: HTMLElement): LaptopHandle {
  const q = new URLSearchParams(location.search);
  const stage = h('div', { class: 'll-stage' });
  const caption = h('div', { class: 'll-caption' });
  const side = h('aside', { class: 'll-side' });
  root.append(h('div', { class: 'll-shell' },
    h('header', { class: 'll-top' }, h('a', { class: 'll-back', href: '/dev' }, '<- DEV'), h('b', {}, 'LAPTOP ', h('span', {}, 'LAB')), h('small', {}, 'the old clamshell from his inventory')),
    h('main', { class: 'll-main' }, h('div', { class: 'll-panel' }, stage, caption), side)));
  const start = q.get('state') as LaptopState | null;
  const page = startPageAudio('laptop', root, q.get('mute') === '1' ? { muted: true } : undefined);
  const muted = page.muted;
  const hear = laptopHear(page.bus);
  const lt = mountLaptop(stage, {
    start: start && LAPTOP_STATES.includes(start) ? start : 'closed',
    speed: q.has('speed') ? Number(q.get('speed')) : 1,
    muted,
    hear,
  });
  side.append(
    machineBox(lt),
    inputBox(lt),
    questBox(lt),
    soundBox(lt, (next) => page.setMuted(next), () => page.bus.emit({ kind: 'laptop', action: 'trackpad' })),
  );
  const say = (s: LaptopState): void => { caption.textContent = CAPTION[s]; };
  say(lt.machine.state);
  lt.onState(say);
  return lt;
}
