import { writeDraftPack } from '../chapters/draft.js';
import { stepOutput } from '../chapters/script.js';
import type { ChapterPack, LevelSpec, ScriptStep } from '../chapters/types.js';
import { h, sleep } from '../editor-core/dom.js';
import { GamePreviewShell } from '../editor-core/game-preview.js';
import type { ViewportStageController } from '../editor-core/viewport-stage.js';
import { StageStudio, type StudioEventHooks } from './stage-studio.js';

export interface PreviewTarget {
  level: LevelSpec;
  pack: ChapterPack;
}

export interface PreviewOpts extends StudioEventHooks {
  getPack: () => ChapterPack;
  onToggleZen?: () => void;
  onRevealSelected?: () => void;
}

/**
 * Center Stage Viewport (`stageEl`) + Bottom Stage Studio Dock (`timelineEl`).
 * Runs the real game in stage-only editor mode (`?draft=1&nointro=1&editor=1`).
 */
export class Preview {
  readonly stageEl: HTMLElement;
  readonly timelineEl: HTMLElement;
  private readonly shell: GamePreviewShell;
  private readonly studio: StageStudio;
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
      onReload: () => this.reload(true),
      selectionTitle: 'Selected spec item — click to reveal & focus in Inspector',
      onRevealSelected: () => this.opts.onRevealSelected?.(),
      onToggleZen: this.opts.onToggleZen,
      onHideBar: () => this.opts.onToggleDock?.('stagebar'),
      pills: [this.levelPill],
      stageBarControls: [],
    });
    this.studio = new StageStudio({
      play: this.shell.play,
      logEl: this.shell.logEl,
      statusEl: this.shell.statusEl,
      setStatus: (msg) => this.setStatus(msg),
      getPack: () => this.currentTarget()?.pack ?? this.opts.getPack(),
      getLevel: () => this.currentTarget()?.level ?? null,
      onRestart: () => this.reload(true),
      onOpenInLab: () => this.openInLab(),
      onAddObject: (cwd, preset) => this.opts.onAddObject?.(cwd, preset),
      onToggleDock: this.opts.onToggleDock,
      onSelectActor: this.opts.onSelectActor,
      onTransformActor: this.opts.onTransformActor,
    });
    this.shell.stageEl.querySelector('.cx-bar-right')?.before(...this.studio.stageBarControls);
    this.stageEl = this.shell.stageEl;
    this.timelineEl = this.studio.timelineEl;
  }

  get stage(): ViewportStageController {
    return this.shell.stage;
  }

  get currentLevelId(): string {
    return this.target?.level.id ?? '';
  }

  get livePhase(): string {
    return this.shell.phase;
  }

  get activeCwd(): string {
    return this.studio.getCwd();
  }

  setSelectedReadout(label: string | null): void {
    this.shell.setSelectedReadout(label);
  }

  setStageSelectedActor(actorId: string | null): void {
    this.studio.setSelectedActor(actorId);
  }

  syncDraftInPlace(): boolean {
    const cur = this.currentTarget();
    if (!cur) return false;
    writeDraftPack(cur.pack);
    const api = this.shell.play.win?.__stageEditor;
    if (!api?.ready) return false;
    const ok = api.syncDraftInPlace(cur.pack.manifest.id);
    if (ok) {
      this.studio.refreshCatalog();
      this.studio.refreshRooms();
    }
    return ok;
  }

  private setStatus(text: string): void {
    this.shell.setStatus(text);
  }

  private updateStepLabel(): void {
    const cmds = this.target?.level.solutionCommands ?? [];
    this.stepLabel.textContent = cmds.length ? `solution ${Math.min(this.cursor, cmds.length)}/${cmds.length}` : '';
  }

  /** Loads `level` with the current draft and swaps in place when the stage editor is already live. */
  load(level: LevelSpec): void {
    this.target = { level, pack: this.opts.getPack() };
    this.reload(false);
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

  reload(forceIframe = false): void {
    const cur = this.currentTarget();
    if (!cur) return;
    this.target = cur;
    this.levelPill.textContent = `${String(cur.level.index).padStart(2, '0')} · ${cur.level.id}`;
    this.running = false;
    this.cursor = 0;
    this.studio.stopDialogs();
    this.updateStepLabel();
    writeDraftPack(cur.pack);

    const api = !forceIframe ? this.shell.play.win?.__stageEditor : undefined;
    if (api?.ready && api.swapDraft(cur.pack.manifest.id, cur.level.id)) {
      this.shell.prepareSwap();
      this.studio.attachFrame();
      return;
    }

    const url = `/play/${encodeURIComponent(cur.pack.manifest.id)}/${encodeURIComponent(cur.level.id)}?draft=1&nointro=1&editor=1`;
    void this.shell.load(url).then(({ live }) => {
      if (live) this.studio.attachFrame();
    });
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
    const skipBtn = this.shell.play.win?.document.querySelector<HTMLButtonElement>('#skip-dialog-btn');
    if (skipBtn && !skipBtn.hidden) skipBtn.click();
    if (this.shell.play.win?.__game?.snapshot()?.pendingLaptopTasks?.length) {
      this.shell.play.win.__game.completeLaptopTasks?.();
      const skipAfter = this.shell.play.win?.document.querySelector<HTMLButtonElement>('#skip-dialog-btn');
      if (skipAfter && !skipAfter.hidden) skipAfter.click();
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
