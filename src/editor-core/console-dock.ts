import type { KernelEvent } from '../contracts/events.js';
import { clear, h } from './dom.js';
import type { PlayFrame } from './play-frame.js';

/** Templates for the "fire an event" box: what the stage and the terminal do with each one. */
const EVENT_PRESETS: Record<string, KernelEvent> = {
  AGENT_TAUNT: { type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', text: 'CLAUDE: "Test line."', mood: 'laugh' },
  VIBECODER_EMOTE: { type: 'VIBECODER_EMOTE', emote: 'shock', text: 'WHAT?!' },
  KIRO_ACTION: { type: 'KIRO_ACTION', action: 'scan', core: 'qwen', message: 'Kiro scans the room.' },
  ENTITY_SPAWNED: { type: 'ENTITY_SPAWNED', entityId: 'preview_virus', model: 'malware.virus', reason: 'script' },
  ENEMY_KILLED: { type: 'ENEMY_KILLED', entityId: 'preview_virus', model: 'malware.virus', how: 'SIGKILL' },
  ENEMY_ATTACK: { type: 'ENEMY_ATTACK', entityId: 'preview_virus', model: 'malware.virus', damage: 5, attack: 'bite' },
  PICKUP_COLLECTED: { type: 'PICKUP_COLLECTED', entityId: 'preview_ram', item: 'ram', amount: 16, label: '+16GB RAM' },
  PLAYER_DAMAGED: { type: 'PLAYER_DAMAGED', amount: 10, hpRemaining: 90, sourceName: 'preview' },
  TUTORIAL_STEP: { type: 'TUTORIAL_STEP', step: 1, total: 3, prompt: 'Try ls.', command: 'ls', agent: 'kiro', done: false },
};

export interface ConsoleDockSpec {
  /** Accessible name of the dock. */
  label: string;
  /** The transport buttons and status, built by the editor. */
  bar: HTMLElement;
  /** The scrolling event log element (`role="log"`), owned by the editor so it can append to it. */
  logEl: HTMLElement;
  /** The game iframe: typed lines and raw events go to it. */
  play: PlayFrame;
  /** Reports an unparsable event payload. */
  onStatus: (message: string) => void;
  onToggleLog: () => void;
  onHide: () => void;
  /** An editor panel shown left of the send box and the log; the Log toggle hides only those (the Terminal Lab's script). */
  lead?: HTMLElement;
}

function emitBox(spec: ConsoleDockSpec): HTMLElement {
  const select = h('select', { 'aria-label': 'Preset event type' }, ...Object.keys(EVENT_PRESETS).map((k) => h('option', { value: k }, k)));
  const area = h('textarea', { rows: 3, class: 'mono', spellcheck: 'false', 'aria-label': 'Event JSON payload' });
  const fill = (): void => { area.value = JSON.stringify(EVENT_PRESETS[select.value], null, 2); };
  select.addEventListener('change', fill);
  fill();
  const fire = h('button', { type: 'button', class: 'btn small' }, 'Fire');
  fire.addEventListener('click', () => {
    try {
      spec.play.emit(JSON.parse(area.value) as KernelEvent);
    } catch (err) {
      spec.onStatus(`bad JSON: ${String((err as Error).message)}`);
    }
  });
  return h('details', { class: 'pv-emit' }, h('summary', {}, 'Fire an event on the stage'), h('div', { class: 'pv-emit-row' }, select, fire), area);
}

function head(spec: ConsoleDockSpec): HTMLElement {
  const iconBtn = (cls: string, title: string, label: string, glyph: string, extra: Record<string, string> = {}, onclick?: () => void): HTMLElement =>
    h('button', { type: 'button', class: `mini ${cls}`, title, 'aria-label': label, ...extra, onclick }, glyph);
  return h(
    'div',
    { class: 'ch-console-head', 'data-panel-drag': 'timeline' },
    iconBtn('cx-drag-grip', 'Drag Console panel (double-click to dock)', 'Move Console panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)', '⠿', { 'data-drag-grip': 'timeline' }),
    spec.bar,
    h('span', { class: 'cx-bar-spacer' }),
    iconBtn('cx-redock-btn', 'Dock Console to bottom', 'Dock Console to bottom', '📌', { 'data-redock': 'timeline' }),
    iconBtn('cx-dock-toggle', 'Toggle Event Log & Console', 'Toggle Event Log and Console drawer', '⊟', {}, spec.onToggleLog),
    iconBtn('cx-dock-close', 'Hide Console dock (\\)', 'Hide Console dock', '▾', {}, spec.onHide),
  );
}

/** The bottom Console dock shared by the editors: transport bar, a line sender, the raw-event box and the event log. */
export function buildConsoleDock(spec: ConsoleDockSpec): HTMLElement {
  const send = h('input', {
    type: 'text',
    class: 'mono',
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'none',
    'aria-label': 'Send command to player terminal',
    placeholder: 'type a command for the player…',
  });
  const submit = (): void => {
    if (!send.value.trim()) return;
    spec.play.submit(send.value);
    send.value = '';
  };
  send.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229 || e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  });
  const tools = h('div', { class: 'ch-console-tools' }, h('div', { class: 'pv-send pv-send-row' }, send, h('button', { type: 'button', class: 'btn small', onclick: submit }, 'Run')), emitBox(spec));
  const logPane = h(
    'div',
    { class: 'ch-console-log' },
    h(
      'div',
      { class: 'ch-log-head' },
      h('h4', {}, 'Event log'),
      h('button', { type: 'button', class: 'btn small', title: 'Clear event log', onclick: () => clear(spec.logEl) }, 'Clear'),
    ),
    spec.logEl,
  );
  const body = h('div', { class: 'ch-console-body' }, tools, logPane);
  const main = spec.lead ? h('div', { class: 'ch-console-main' }, spec.lead, body) : body;
  return h('section', { class: 'cx-timeline', 'aria-label': spec.label }, head(spec), main);
}
