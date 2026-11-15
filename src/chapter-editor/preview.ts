import { writeDraftPack } from '../chapters/draft.js';
import { stepOutput } from '../chapters/script.js';
import type { ChapterPack, LevelSpec, ScriptStep } from '../chapters/types.js';
import { buildConsoleDock } from '../editor-core/console-dock.js';
import { h, sleep } from '../editor-core/dom.js';
import { GamePreviewShell } from '../editor-core/game-preview.js';
import type { ViewportStageController } from '../editor-core/viewport-stage.js';
import type { ChapterDockId } from './chrome.js';

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
  private readonly shell: GamePreviewShell;
  private readonly levelPill = h('span', { class: 'ch-level-pill', title: 'Active level in preview' }, 'No level');
  private readonly stepLabel = h('span', { class: 'pv-step' });
  private target: PreviewTarget | null = null;
  private cursor = 0;
  private running = false;
  private speed = 700;

  constructor(private readonly opts: PreviewOpts) {
    this.shell = new GamePreviewShell({
      frameTitle: 'Game preview',
      reloadTitle: 'Reload active level preview',
      onReload: () => this.reload(),
      selectionTitle: 'Selected spec item — click to reveal & focus in Inspector',
      onRevealSelected: () => this.opts.onRevealSelected?.(),
      onToggleZen: this.opts.onToggleZen,
      onHideBar: () => this.opts.onToggleDock?.('stagebar'),
      pills: [this.levelPill],
    });
    this.stageEl = this.shell.stageEl;
    this.timelineEl = this.buildConsoleDock();
  }

  get stage(): ViewportStageController {
    return this.shell.stage;
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
      h('button', { type: 'button', class: 'btn small', title: 'Import a copy of this level into Terminal Lab (read-only toward chapters/)', onclick: () => this.openInLab() }, '⚗ Open in Lab'),
      speed,
      this.stepLabel,
      this.shell.statusEl,
    );
    return buildConsoleDock({
      label: 'Console and Solution Walkthrough',
      bar,
      logEl: this.shell.logEl,
      play: this.shell.play,
      onStatus: (msg) => this.setStatus(msg),
      onToggleLog: () => this.opts.onToggleDock?.('log'),
      onHide: () => this.opts.onToggleDock?.('timeline'),
    });
  }

  get currentLevelId(): string {
    return this.target?.level.id ?? '';
  }

  get livePhase(): string {
    return this.shell.phase;
  }

  setSelectedReadout(label: string | null): void {
    this.shell.setSelectedReadout(label);
  }

  private setStatus(text: string): void {
    this.shell.setStatus(text);
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

  private currentTarget(): PreviewTarget | null {
    if (!this.target) return null;
    const pack = this.opts.getPack();
    const level = pack.levels.find((l) => l.id === this.target?.level.id) ?? this.target.level;
    return { level, pack };
  }

  openInLab(): void {
    const cur = this.currentTarget();
    if (!cur) return;
    writeDraftPack(cur.pack);
    const ref = `${cur.pack.manifest.id}/${cur.level.id}`;
    window.open(`/terminal-lab?from=${encodeURIComponent(ref)}&draft=1`, '_blank', 'noopener');
  }

  reload(): void {
    const cur = this.currentTarget();
    if (!cur) return;
    this.target = cur;
    this.levelPill.textContent = `${String(cur.level.index).padStart(2, '0')} · ${cur.level.id}`;
    this.running = false;
    this.cursor = 0;
    this.updateStepLabel();
    writeDraftPack(cur.pack);
    void this.shell.load(`/play/${encodeURIComponent(cur.pack.manifest.id)}/${encodeURIComponent(cur.level.id)}?draft=1&nointro=1`);
  }

  async stepOnce(): Promise<void> {
    const cmds = this.target?.level.solutionCommands ?? [];
    const next = cmds[this.cursor];
    if (next === undefined) {
      this.setStatus('solution finished');
      return;
    }
    if (this.shell.play.phase !== 'play') {
      const live = await this.shell.waitUntilLive();
      if (!live || this.shell.play.phase !== 'play') return;
    }
    this.cursor += 1;
    this.updateStepLabel();
    this.setStatus(`$ ${next}`);
    await this.shell.play.typeLine(next);
  }

  async runAll(): Promise<void> {
    if (this.running || !this.target) return;
    const target = this.target;
    this.running = true;
    while (this.running && this.target === target && this.cursor < target.level.solutionCommands.length) {
      await this.stepOnce();
      if (!this.running || this.target !== target) break;
      await sleep(this.speed);
    }
    if (this.target === target) {
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
    const term = this.shell.play.win?.__term;
    if (!term) {
      this.setStatus('preview is not running');
      return;
    }
    for (const ev of out.events) term.emit(ev);
    if (out.print) term.print(out.print.replace(/\n/g, '\r\n'));
  }

  dispose(): void {
    this.shell.dispose();
  }
}
