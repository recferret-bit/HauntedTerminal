import type { ChapterPack, LevelSpec } from '../chapters/types.js';
import type { StageActorRef, StageTransformPatch } from '../contracts/stage-editor.js';
import { buildConsoleDock } from '../editor-core/console-dock.js';
import { clear, h } from '../editor-core/dom.js';
import type { PlayFrame } from '../editor-core/play-frame.js';
import { type AddObjectPreset } from './actor-mutator.js';
import type { ChapterDockId } from './chrome.js';
import {
  collectDialogCatalog,
  collectNarrativeSequence,
  createDialogRunner,
  type DialogBeatItem,
} from './dialog-runner.js';

const ENEMY_TYPES = [
  'bug',
  'virus',
  'worm',
  'trojan',
  'spyware',
  'rootkit',
  'exploit',
  'crack',
  'ransomware',
  'zombie',
] as const;

const ADD_PRESETS: ReadonlyArray<{ value: AddObjectPreset; label: string }> = [
  { value: 'prop', label: 'Prop (prop.tar)' },
  { value: 'enemy', label: 'Enemy (bug)' },
  { value: 'pickup', label: 'Pickup: RAM' },
  { value: 'pickup:ssd', label: 'Pickup: SSD' },
  { value: 'pickup:gpu', label: 'Pickup: GPU' },
  { value: 'pickup:energy', label: 'Pickup: Energy' },
  { value: 'pickup:tube_transistor', label: 'Pickup: Tube Transistor' },
  { value: 'pickup:tensor_gpu', label: 'Pickup: Tensor GPU' },
  { value: 'pickup:vram_module', label: 'Pickup: VRAM Module' },
  { value: 'door', label: 'Subdir Door' },
  { value: 'socket', label: 'Socket' },
];

export interface StudioEventHooks {
  onToggleDock?: (dock: ChapterDockId) => void;
  onAddObject?: (cwd: string, preset: AddObjectPreset) => void;
  onSelectActor?: (hit: StageActorRef | null, cwd: string) => void;
  onTransformActor?: (patch: StageTransformPatch, cwd: string) => void;
}

export interface StageStudioOpts extends StudioEventHooks {
  play: PlayFrame;
  logEl: HTMLElement;
  statusEl: HTMLElement;
  setStatus: (text: string) => void;
  getPack: () => ChapterPack;
  getLevel: () => LevelSpec | null;
  onRestart: () => void;
  onOpenInLab: () => void;
}

export class StageStudio {
  readonly stageBarControls: HTMLElement[];
  readonly timelineEl: HTMLElement;

  private hudVisible = true;
  private showHidden = false;
  private aiPaused = true;
  private catalog: DialogBeatItem[] = [];

  private readonly hudBtn: HTMLButtonElement;
  private readonly hiddenBtn: HTMLButtonElement;
  private readonly aiBtn: HTMLButtonElement;
  private readonly roomSelect: HTMLSelectElement;
  private readonly dialogSelect: HTMLSelectElement;
  private readonly addSelect: HTMLSelectElement;
  private readonly enemySelect: HTMLSelectElement;
  private readonly nextBeatBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly runner;

  constructor(private readonly opts: StageStudioOpts) {
    this.hudBtn = h(
      'button',
      { type: 'button', class: 'cx-view-btn', 'aria-pressed': 'true', title: 'Show/Hide in-game HUD chrome' },
      '👁 HUD',
    ) as HTMLButtonElement;
    this.hiddenBtn = h(
      'button',
      { type: 'button', class: 'cx-view-btn', 'aria-pressed': 'false', title: 'Preview appearWhen, hidden, and pre-spawned actors' },
      '👻 Hidden',
    ) as HTMLButtonElement;
    this.aiBtn = h(
      'button',
      { type: 'button', class: 'cx-view-btn', 'aria-pressed': 'true', title: 'Pause AI ticks while editing stage' },
      '⏸ AI',
    ) as HTMLButtonElement;
    this.roomSelect = h(
      'select',
      { class: 'cx-studio-select', 'aria-label': 'Active room directory', title: 'Switch active room directory (cwd)' },
    ) as HTMLSelectElement;

    this.dialogSelect = h(
      'select',
      { class: 'ch-studio-select', 'aria-label': 'Specific dialog' },
    ) as HTMLSelectElement;
    this.addSelect = h(
      'select',
      { class: 'ch-studio-select', 'aria-label': 'Add object kind' },
      ...ADD_PRESETS.map((p) => h('option', { value: p.value }, p.label)),
    ) as HTMLSelectElement;
    this.enemySelect = h(
      'select',
      { class: 'ch-studio-select ch-studio-enemy', 'aria-label': 'Test enemy type' },
      ...ENEMY_TYPES.map((t) => h('option', { value: t }, t)),
    ) as HTMLSelectElement;

    this.nextBeatBtn = h('button', { type: 'button', class: 'btn small', disabled: true }, '⏭ Next Beat') as HTMLButtonElement;
    this.stopBtn = h('button', { type: 'button', class: 'btn small' }, '■ Stop') as HTMLButtonElement;

    this.runner = createDialogRunner(
      () => this.api(),
      (beat) => {
        this.opts.setStatus(`dialog: ${beat.label}`);
        if (beat.print) {
          const text = beat.print.replace(/\s+/g, ' ').trim().slice(0, 96);
          if (text) {
            this.opts.logEl.append(h('div', { class: 'pv-ev talk' }, `PRINT  ${text}`));
            while (this.opts.logEl.childElementCount > 300) this.opts.logEl.firstElementChild?.remove();
            this.opts.logEl.scrollTop = this.opts.logEl.scrollHeight;
          }
        }
      },
    );
    this.runner.onState((st) => {
      this.nextBeatBtn.disabled = st.total === 0 || st.index >= st.total;
      if (!st.running && st.total === 0) this.syncStatusText();
    });

    this.stageBarControls = [
      h(
        'div',
        { class: 'cx-bar-grp cx-studio-bar' },
        this.hudBtn,
        this.hiddenBtn,
        this.aiBtn,
        h('span', { class: 'cx-bar-lbl' }, '📁 Room'),
        this.roomSelect,
      ),
    ];

    this.bindControls();
    this.timelineEl = this.buildDock();
  }

  private api() {
    return this.opts.play.win?.__stageEditor ?? null;
  }

  private syncStatusText(): void {
    if (this.api()?.ready) this.opts.setStatus('live');
  }

  private bindControls(): void {
    this.hudBtn.addEventListener('click', () => {
      this.hudVisible = !this.hudVisible;
      this.hudBtn.setAttribute('aria-pressed', String(this.hudVisible));
      this.api()?.setHudVisible(this.hudVisible);
    });
    this.hiddenBtn.addEventListener('click', () => {
      this.showHidden = !this.showHidden;
      this.hiddenBtn.setAttribute('aria-pressed', String(this.showHidden));
      this.api()?.setShowHidden(this.showHidden);
    });
    this.aiBtn.addEventListener('click', () => {
      this.aiPaused = !this.aiPaused;
      this.aiBtn.setAttribute('aria-pressed', String(this.aiPaused));
      this.api()?.setAiPaused(this.aiPaused);
    });
    this.roomSelect.addEventListener('change', () => {
      const api = this.api();
      if (!api || !this.roomSelect.value) return;
      api.setCwd(this.roomSelect.value);
      this.opts.setStatus(`room ${this.roomSelect.value}`);
    });
  }

  private buildDock(): HTMLElement {
    const bar = h(
      'div',
      { class: 'pv-bar' },
      h('button', { type: 'button', class: 'btn small', onclick: () => this.restartLevel() }, '↻ Restart'),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => this.runAllDialogs() }, '💬 All Dialogs'),
      this.nextBeatBtn,
      this.stopBtn,
      h('button', { type: 'button', class: 'btn small', onclick: () => this.injectTestEnemy() }, '⚡ Test Enemy'),
      h('button', { type: 'button', class: 'btn small', onclick: () => this.killAllEnemies() }, '💀 Kill Enemies'),
      h('button', { type: 'button', class: 'btn small', title: 'Import a copy of this level into Terminal Lab', onclick: () => this.opts.onOpenInLab() }, '⚗ Open in Lab'),
      this.opts.statusEl,
    );

    this.nextBeatBtn.addEventListener('click', () => this.runner.nextBeat());
    this.stopBtn.addEventListener('click', () => {
      this.runner.stop();
      this.opts.setStatus('dialogs cleared');
    });

    const dialogRow = h(
      'div',
      { class: 'ch-studio-row' },
      this.dialogSelect,
      h('button', { type: 'button', class: 'btn small', onclick: () => this.runSelectedDialog() }, '▶ Run Dialog'),
    );
    const objectRow = h(
      'div',
      { class: 'ch-studio-row' },
      this.addSelect,
      h('button', { type: 'button', class: 'btn small', onclick: () => this.addSelectedObject() }, '+ Add to Level'),
      this.enemySelect,
    );

    return buildConsoleDock({
      label: 'Stage Studio',
      bar,
      logEl: this.opts.logEl,
      play: this.opts.play,
      hideCommandInput: true,
      emitSummary: 'Event Tester',
      extraTools: [dialogRow, objectRow],
      onStatus: this.opts.setStatus,
      onToggleLog: () => this.opts.onToggleDock?.('log'),
      onHide: () => this.opts.onToggleDock?.('timeline'),
    });
  }

  attachFrame(): void {
    const api = this.api();
    this.refreshCatalog();
    if (!api) return;
    api.onEditorCallbacks({
      onSelect: (hit) => this.opts.onSelectActor?.(hit, api.getCwd()),
      onTransform: (patch) => this.opts.onTransformActor?.(patch, api.getCwd()),
      onState: (st) => {
        this.hudVisible = st.hudVisible;
        this.showHidden = st.showHidden;
        this.aiPaused = st.aiPaused;
        this.hudBtn.setAttribute('aria-pressed', String(st.hudVisible));
        this.hiddenBtn.setAttribute('aria-pressed', String(st.showHidden));
        this.aiBtn.setAttribute('aria-pressed', String(st.aiPaused));
        if ([...this.roomSelect.options].some((o) => o.value === st.cwd)) {
          this.roomSelect.value = st.cwd;
        }
      },
    });
    if (!this.hudVisible) api.setHudVisible(false);
    if (this.showHidden) api.setShowHidden(true);
    if (!this.aiPaused) api.setAiPaused(false);
    this.refreshRooms();
  }

  refreshRooms(): void {
    const api = this.api();
    if (!api) return;
    const dirs = api.listDirs();
    const cur = api.getCwd();
    clear(this.roomSelect);
    for (const d of dirs) {
      this.roomSelect.append(h('option', { value: d, selected: d === cur }, d));
    }
    if (dirs.includes(cur)) this.roomSelect.value = cur;
  }

  refreshCatalog(): void {
    const level = this.opts.getLevel();
    const prev = this.dialogSelect.value;
    this.catalog = level ? collectDialogCatalog(this.opts.getPack(), level) : [];
    clear(this.dialogSelect);
    if (this.catalog.length === 0) {
      this.dialogSelect.append(h('option', { value: '' }, 'No dialogs in level'));
      return;
    }
    for (const item of this.catalog) {
      this.dialogSelect.append(h('option', { value: item.id }, item.label));
    }
    if (prev && this.catalog.some((c) => c.id === prev)) {
      this.dialogSelect.value = prev;
    }
  }

  setSelectedActor(actorId: string | null): void {
    this.api()?.setSelectedActor(actorId);
  }

  getCwd(): string {
    return this.api()?.getCwd() ?? this.opts.getLevel()?.cwd ?? '/home/dev';
  }

  stopDialogs(): void {
    this.runner.stop();
  }

  private restartLevel(): void {
    this.runner.stop();
    if (this.api()?.restartLevel()) {
      this.attachFrame();
      this.opts.setStatus('level restarted');
    } else {
      this.opts.onRestart();
    }
  }

  private runAllDialogs(): void {
    this.refreshCatalog();
    const level = this.opts.getLevel();
    const narrative = level ? collectNarrativeSequence(this.opts.getPack(), level) : [];
    const seq = narrative.length > 0 ? narrative : this.catalog;
    if (seq.length === 0) {
      this.opts.setStatus('no dialogs in this level');
      return;
    }
    this.runner.runAll(seq);
  }

  private runSelectedDialog(): void {
    this.refreshCatalog();
    const id = this.dialogSelect.value;
    if (!id || !this.runner.runSpecific(this.catalog, id)) {
      this.opts.setStatus('select a dialog first');
    }
  }

  private injectTestEnemy(): void {
    const type = this.enemySelect.value || 'bug';
    if (this.api()?.injectTestEnemy(type)) {
      this.opts.setStatus(`spawned test ${type}`);
    }
  }

  private killAllEnemies(): void {
    const count = this.api()?.killAllEnemies() ?? 0;
    this.opts.setStatus(`killed ${count} ${count === 1 ? 'enemy' : 'enemies'}`);
  }

  private addSelectedObject(): void {
    const preset = (this.addSelect.value || 'prop') as AddObjectPreset;
    this.opts.onAddObject?.(this.getCwd(), preset);
  }
}
