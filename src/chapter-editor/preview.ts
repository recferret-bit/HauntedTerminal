import type { KernelEvent } from '../contracts/events.js';
import { writeDraftPack } from '../chapters/draft.js';
import { stepOutput } from '../chapters/script.js';
import type { ChapterPack, LevelSpec, ScriptStep } from '../chapters/types.js';
import { renderStageBarRightGroup } from '../editor-core/chrome.js';
import { clear, h, type Rec } from '../editor-core/dom.js';
import { ViewportStageController } from '../editor-core/viewport-stage.js';
import type { ChapterDockId } from './chrome.js';

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

export interface PreviewOpts {
  getPack: () => ChapterPack;
  onToggleDock?: (dock: ChapterDockId) => void;
  onToggleZen?: () => void;
  onRevealSelected?: () => void;
}

/**
 * Center Game Viewport (`stageEl`) + Bottom Console & Solution Walkthrough Dock (`timelineEl`).
 * Runs the real game in an iframe fed with the editor's unsaved draft (`?draft=1`).
 */
export class Preview {
  readonly stageEl: HTMLElement;
  readonly timelineEl: HTMLElement;
  readonly stage: ViewportStageController;
  private readonly levelPill = h('span', { class: 'ch-level-pill', title: 'Active level in preview' }, 'No level');
  private readonly selPill: HTMLButtonElement;
  private readonly log = h('div', { class: 'pv-log', role: 'log', 'aria-label': 'Event log' });
  private readonly status = h('span', { class: 'pv-status', role: 'status', 'aria-live': 'polite' }, 'idle');
  private readonly stepLabel = h('span', { class: 'pv-step' });
  private target: PreviewTarget | null = null;
  private cursor = 0;
  private logged = 0;
  private running = false;
  private loadToken = 0;
  private timer = 0;
  private speed = 700;

  constructor(private readonly opts: PreviewOpts) {
    this.stage = new ViewportStageController({
      frameTitle: 'Game preview',
      allow: 'autoplay',
      bindIframeCtrlWheel: true,
    });
    this.selPill = h('button', {
      type: 'button',
      class: 'cx-sel-pill',
      hidden: true,
      title: 'Selected spec item — click to reveal & focus in Inspector',
      onclick: () => this.opts.onRevealSelected?.(),
    }, '');

    const stageBar = this.buildStageBar();
    this.stageEl = h('section', { class: 'cx-stage', 'aria-label': 'Game Viewport' }, stageBar, this.stage.matEl);
    this.timelineEl = this.buildConsoleDock();
    this.timer = window.setInterval(() => this.pollLog(), POLL_MS);
  }

  private get win(): PlayWindow | null {
    return this.stage.frame.contentWindow as PlayWindow | null;
  }

  private buildStageBar(): HTMLElement {
    const gameGrp = h(
      'div',
      { class: 'cx-bar-grp', role: 'group', 'aria-label': 'Game viewport controls' },
      h('span', { class: 'cx-bar-lbl' }, 'Game'),
      this.stage.aspectBtn,
      h('button', { type: 'button', class: 'btn small', title: 'Reload active level preview', onclick: () => this.reload() }, '↻ Reload'),
      this.levelPill,
    );
    const rightGrp = renderStageBarRightGroup({
      selReadoutBtn: this.selPill,
      hint: 'Ctrl+Wheel: Canvas',
      onToggleZen: this.opts.onToggleZen,
      onHideBar: () => this.opts.onToggleDock?.('stagebar'),
    });
    return h('div', { class: 'cx-stage-bar' }, this.stage.buildZoomGroup('Canvas'), gameGrp, rightGrp);
  }

  private buildConsoleDock(): HTMLElement {
    const speed = h(
      'select',
      { title: 'Delay between typed commands', 'aria-label': 'Command playback delay' },
      ...[300, 700, 1500, 3000].map((ms) => h('option', { value: String(ms), selected: ms === this.speed }, `${ms} ms`)),
    );
    speed.addEventListener('change', () => { this.speed = Number(speed.value); });

    // `.pv-bar button:nth-child(2)` must remain `⏭ Next command` for harness compatibility.
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
    const consoleHead = h(
      'div',
      { class: 'ch-console-head', 'data-panel-drag': 'timeline' },
      h('button', {
        type: 'button',
        class: 'mini cx-drag-grip',
        'data-drag-grip': 'timeline',
        title: 'Drag Console panel (double-click to dock)',
        'aria-label': 'Move Console panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)',
      }, '⠿'),
      bar,
      h('span', { class: 'cx-bar-spacer' }),
      h('button', {
        type: 'button',
        class: 'mini cx-redock-btn',
        'data-redock': 'timeline',
        title: 'Dock Console to bottom',
        'aria-label': 'Dock Console to bottom',
      }, '📌'),
      h('button', {
        type: 'button',
        class: 'mini cx-dock-toggle',
        title: 'Toggle Event Log & Console',
        'aria-label': 'Toggle Event Log and Console drawer',
        onclick: () => this.opts.onToggleDock?.('log'),
      }, '⊟'),
      h('button', {
        type: 'button',
        class: 'mini cx-dock-close',
        title: 'Hide Console dock (\\)',
        'aria-label': 'Hide Console dock',
        onclick: () => this.opts.onToggleDock?.('timeline'),
      }, '▾'),
    );

    const send = h('input', {
      type: 'text',
      class: 'mono',
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'none',
      'aria-label': 'Send command to player terminal',
      placeholder: 'type a command for the player…',
    });
    const submitCommand = (): void => {
      if (!send.value.trim()) return;
      this.win?.__term?.submit(send.value);
      send.value = '';
    };
    send.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229 || e.key !== 'Enter') return;
      e.preventDefault();
      submitCommand();
    });
    const runCmdBtn = h('button', { type: 'button', class: 'btn small', onclick: submitCommand }, 'Run');
    const tools = h('div', { class: 'ch-console-tools' }, h('div', { class: 'pv-send pv-send-row' }, send, runCmdBtn), this.emitBox());
    const logPane = h(
      'div',
      { class: 'ch-console-log' },
      h(
        'div',
        { class: 'ch-log-head' },
        h('h4', {}, 'Event log'),
        h('button', { type: 'button', class: 'btn small', title: 'Clear event log', onclick: () => clear(this.log) }, 'Clear'),
      ),
      this.log,
    );
    return h(
      'section',
      { class: 'cx-timeline', 'aria-label': 'Console and Solution Walkthrough' },
      consoleHead,
      h('div', { class: 'ch-console-body' }, tools, logPane),
    );
  }

  private emitBox(): HTMLElement {
    const select = h('select', { 'aria-label': 'Preset event type' }, ...Object.keys(EVENT_PRESETS).map((k) => h('option', { value: k }, k)));
    const area = h('textarea', { rows: 3, class: 'mono', spellcheck: 'false', 'aria-label': 'Event JSON payload' });
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

  get currentLevelId(): string {
    return this.target?.level.id ?? '';
  }

  get livePhase(): string {
    return this.win?.__term?.phase?.() ?? this.status.textContent ?? 'idle';
  }

  setSelectedReadout(label: string | null): void {
    this.selPill.hidden = !label;
    this.selPill.textContent = label ? `◎ ${label}` : '';
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
    this.target = { level, pack: this.opts.getPack() };
    this.reload();
  }

  reload(): void {
    if (!this.target) return;
    const pack = this.opts.getPack();
    const level = pack.levels.find((l) => l.id === this.target?.level.id) ?? this.target.level;
    this.target = { level, pack };
    this.levelPill.textContent = `${String(level.index).padStart(2, '0')} · ${level.id}`;
    this.running = false;
    this.cursor = 0;
    this.logged = 0;
    clear(this.log);
    this.updateStepLabel();
    writeDraftPack(pack);
    const token = ++this.loadToken;
    const url = `/play/${encodeURIComponent(pack.manifest.id)}/${encodeURIComponent(level.id)}?draft=1&nointro=1&t=${Date.now()}&seq=${token}`;
    this.setStatus('loading…');
    this.stage.frame.src = url;
    void this.waitUntilLive(token);
  }

  private async waitUntilLive(token = this.loadToken): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < BOOT_TIMEOUT_MS) {
      if (token !== this.loadToken) return false;
      if (this.win?.__term?.phase?.() === 'play') {
        this.setStatus('live');
        return true;
      }
      await new Promise((r) => window.setTimeout(r, 250));
    }
    if (token === this.loadToken) this.setStatus('the game did not start (see the iframe)');
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
    if (this.win?.__term?.phase?.() !== 'play') {
      const live = await this.waitUntilLive();
      if (!live || this.win?.__term?.phase?.() !== 'play') return;
    }
    this.cursor += 1;
    this.updateStepLabel();
    this.setStatus(`$ ${next}`);
    await this.typeLine(next);
  }

  async runAll(): Promise<void> {
    if (this.running || !this.target) return;
    const token = this.loadToken;
    this.running = true;
    while (this.running && token === this.loadToken && this.cursor < this.target.level.solutionCommands.length) {
      await this.stepOnce();
      if (!this.running || token !== this.loadToken) break;
      await new Promise((r) => window.setTimeout(r, this.speed));
    }
    if (token === this.loadToken) {
      this.running = false;
      this.setStatus(this.cursor >= (this.target?.level.solutionCommands.length ?? 0) ? 'solution finished' : 'stopped');
    }
  }

  /** Plays one script step on the live stage (dialog bubble, taunt, emote, tutorial card...). */
  playStep(step: ScriptStep): void {
    const pack = this.opts.getPack();
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
}
