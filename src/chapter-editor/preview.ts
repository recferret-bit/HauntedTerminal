import type { KernelEvent } from '../contracts/events.js';
import { writeDraftPack } from '../chapters/draft.js';
import { stepOutput } from '../chapters/script.js';
import type { ChapterPack, LevelSpec, ScriptStep } from '../chapters/types.js';
import { clear, h, type Rec } from './dom.js';

/** The automation hooks `src/play/loop.ts` puts on the game window. */
interface PlayWindow extends Window {
  __term?: {
    submit(line: string): void;
    emit(ev: KernelEvent): void;
    print(text: string): void;
    busy(): boolean;
    phase(): string;
  };
  __game?: { events(): KernelEvent[]; snapshot(): { cwd: string; hp: number; maxHp: number; enemiesLeft: number } };
}

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

const POLL_MS = 400;
const BOOT_TIMEOUT_MS = 30_000;

function describe(ev: KernelEvent): string {
  const r = ev as unknown as Rec;
  const text = r.text ?? r.message ?? r.entityId ?? r.name ?? r.command ?? '';
  const payload = r.payload as Rec | undefined;
  const detail = text || (payload ? String(payload.speakerName ?? '') : '');
  return `${ev.type}${detail ? `  ${String(detail).replace(/\s+/g, ' ').slice(0, 90)}` : ''}`;
}

export interface PreviewTarget {
  level: LevelSpec;
  pack: ChapterPack;
}

/**
 * The real game in an iframe, fed with the editor's unsaved draft (`?draft=1`). Because it is the game itself,
 * dialogs, animations and interactions are exactly what a player gets. The editor only types, emits and watches.
 */
export class Preview {
  readonly root: HTMLElement;
  private readonly frame = h('iframe', { class: 'pv-frame', title: 'Game preview', allow: 'autoplay' });
  private readonly log = h('div', { class: 'pv-log', role: 'log', 'aria-label': 'Event log' });
  private readonly status = h('span', { class: 'pv-status', role: 'status', 'aria-live': 'polite' }, 'idle');
  private readonly stepLabel = h('span', { class: 'pv-step' });
  private target: PreviewTarget | null = null;
  private cursor = 0;
  private logged = 0;
  private running = false;
  private timer = 0;
  private speed = 700;

  constructor(private readonly currentPack: () => ChapterPack) {
    this.root = h('section', { class: 'pv' });
    this.build();
    this.timer = window.setInterval(() => this.pollLog(), POLL_MS);
  }

  private get win(): PlayWindow | null {
    return this.frame.contentWindow as PlayWindow | null;
  }

  private build(): void {
    const speed = h('select', { title: 'Delay between typed commands' }, ...[300, 700, 1500, 3000].map((ms) => h('option', { value: String(ms), selected: ms === this.speed }, `${ms} ms`)));
    speed.addEventListener('change', () => { this.speed = Number(speed.value); });
    const bar = h(
      'div',
      { class: 'pv-bar' },
      h('button', { type: 'button', class: 'btn small', onclick: () => this.reload() }, '↻ Restart level'),
      h('button', { type: 'button', class: 'btn small', onclick: () => void this.stepOnce() }, '⏭ Next command'),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => void this.runAll() }, '▶ Run solution'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { this.running = false; } }, '■ Stop'),
      speed,
      this.stepLabel,
      this.status,
    );
    const send = h('input', { type: 'text', class: 'mono', placeholder: 'type a command for the player…' });
    send.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !send.value.trim()) return;
      this.win?.__term?.submit(send.value);
      send.value = '';
    });
    this.root.append(bar, this.frame, h('div', { class: 'pv-send' }, send), this.emitBox(), h('h4', {}, 'Event log'), this.log);
  }

  private emitBox(): HTMLElement {
    const select = h('select', {}, ...Object.keys(EVENT_PRESETS).map((k) => h('option', { value: k }, k)));
    const area = h('textarea', { rows: 4, class: 'mono', spellcheck: 'false' });
    const fill = (): void => { area.value = JSON.stringify(EVENT_PRESETS[select.value], null, 2); };
    select.addEventListener('change', fill);
    fill();
    const fire = h('button', { type: 'button', class: 'btn small' }, 'Fire');
    fire.addEventListener('click', () => {
      try {
        this.win?.__term?.emit(JSON.parse(area.value) as KernelEvent);
      } catch (err) {
        this.setStatus(`bad JSON: ${String((err as Error).message)}`);
      }
    });
    return h('details', { class: 'pv-emit' }, h('summary', {}, 'Fire an event on the stage'), h('div', { class: 'pv-emit-row' }, select, fire), area);
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private updateStepLabel(): void {
    const cmds = this.target?.level.solutionCommands ?? [];
    this.stepLabel.textContent = cmds.length ? `solution ${Math.min(this.cursor, cmds.length)}/${cmds.length}` : '';
  }

  /** Loads `level` with the current draft and waits until the terminal is live. */
  load(level: LevelSpec): void {
    this.target = { level, pack: this.currentPack() };
    this.reload();
  }

  reload(): void {
    if (!this.target) return;
    const pack = this.currentPack();
    const level = pack.levels.find((l) => l.id === this.target?.level.id) ?? this.target.level;
    this.target = { level, pack };
    this.running = false;
    this.cursor = 0;
    this.logged = 0;
    clear(this.log);
    this.updateStepLabel();
    writeDraftPack(pack);
    const url = `/play/${encodeURIComponent(pack.manifest.id)}/${encodeURIComponent(level.id)}?draft=1&nointro=1&t=${Date.now()}`;
    this.setStatus('loading…');
    this.frame.src = url;
    void this.waitUntilLive();
  }

  private async waitUntilLive(): Promise<boolean> {
    const started = Date.now();
    const src = this.frame.src;
    while (Date.now() - started < BOOT_TIMEOUT_MS) {
      if (this.frame.src !== src) return false;
      if (this.win?.__term?.phase?.() === 'play') {
        this.setStatus('live');
        return true;
      }
      await new Promise((r) => window.setTimeout(r, 250));
    }
    this.setStatus('the game did not start (see the iframe)');
    return false;
  }

  private async typeLine(line: string): Promise<void> {
    const term = this.win?.__term;
    if (!term) return;
    term.submit(line);
    await new Promise((r) => window.setTimeout(r, 120));
    const until = Date.now() + 15_000;
    while (term.busy() && Date.now() < until) await new Promise((r) => window.setTimeout(r, 100));
  }

  async stepOnce(): Promise<void> {
    const cmds = this.target?.level.solutionCommands ?? [];
    const next = cmds[this.cursor];
    if (next === undefined) {
      this.setStatus('solution finished');
      return;
    }
    this.cursor += 1;
    this.updateStepLabel();
    this.setStatus(`$ ${next}`);
    await this.typeLine(next);
  }

  async runAll(): Promise<void> {
    if (this.running || !this.target) return;
    this.running = true;
    while (this.running && this.cursor < this.target.level.solutionCommands.length) {
      await this.stepOnce();
      await new Promise((r) => window.setTimeout(r, this.speed));
    }
    this.running = false;
    this.setStatus(this.cursor >= (this.target?.level.solutionCommands.length ?? 0) ? 'solution finished' : 'stopped');
  }

  /** Plays one script step on the live stage (dialog bubble, taunt, emote, tutorial card...). */
  playStep(step: ScriptStep): void {
    const pack = this.currentPack();
    const levelId = this.target?.level.id ?? '';
    const spec = pack.levels.find((l) => l.id === levelId);
    const out = stepOutput(step, {
      taunt: pack.dialogs?.levels[levelId]?.agentTaunt,
      anchorOf: () => 0,
      tutorial: spec?.script?.tutorial,
    });
    const term = this.win?.__term;
    if (!term) {
      this.setStatus('preview is not running');
      return;
    }
    for (const ev of out.events) term.emit(ev);
    if (out.print) term.print(out.print.replace(/\n/g, '\r\n'));
  }

  private pollLog(): void {
    const events = this.win?.__game?.events?.();
    if (!events || events.length === this.logged) return;
    if (events.length < this.logged) this.logged = 0;
    for (const ev of events.slice(this.logged)) {
      const mood = ev.type === 'AGENT_TAUNT' || ev.type === 'OBSTACLE_DIALOGUE_RENDERED' || ev.type === 'TUTORIAL_STEP' ? 'talk' : '';
      this.log.append(h('div', { class: `pv-ev ${mood}` }, describe(ev)));
    }
    this.logged = events.length;
    while (this.log.childElementCount > 300) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }

  /** URL of the same level in a full browser tab (draft included). */
  playUrl(): string {
    const t = this.target;
    return t ? `/play/${encodeURIComponent(t.pack.manifest.id)}/${encodeURIComponent(t.level.id)}?draft=1&nointro=1` : '#';
  }
}
