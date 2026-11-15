import { writeDraftPack } from '../chapters/draft.js';
import { writeLabConfig } from '../chapters/lab-config.js';
import type { LabInjection, LabInspect } from '../chapters/session-lab-types.js';
import type { ExecRecord } from '../contracts/exec-record.js';
import { GamePreviewShell } from '../editor-core/game-preview.js';
import type { PlayWindow } from '../editor-core/play-frame.js';
import type { TickResult } from '../game/types.js';
import { buildLabPack, labPackId } from './lab-pack.js';
import type { LabScript } from './lab-types.js';

/** What a lab game adds to the game window (`src/play/lab.ts`). */
export interface LabApi {
  seq(): number;
  swap(packId: string, levelId: string): boolean;
  inspect(): LabInspect;
  tick(): TickResult;
  inject(what: LabInjection): TickResult;
  /** `count` is every line run so far; `entries` the newest ones. */
  execLog(): { count: number; entries: ExecRecord[] };
}

export interface LabPlayWindow extends PlayWindow {
  __lab?: LabApi;
}

export interface LabFrameOpts {
  onRevealSelected: () => void;
  onToggleZen: () => void;
  onHideBar: () => void;
  onReload: () => void;
}

/**
 * The real game in the centre of the lab, on a throwaway pack: builds the pack and the lab config from the script, loads
 * the game once and swaps sessions in place on edits, and reads it (`inspect`, the lines typed in its terminal).
 */
export class LabFrame {
  readonly shell: GamePreviewShell<LabPlayWindow>;
  /** The level as the game reported it last, or null while it starts. */
  live: LabInspect | null = null;
  private linesSeen = 0;

  constructor(opts: LabFrameOpts) {
    this.shell = new GamePreviewShell<LabPlayWindow>({
      frameTitle: 'Terminal Lab game',
      reloadTitle: 'Reload the lab level',
      onReload: opts.onReload,
      selectionTitle: 'Selected object: click to open it in the Inspector',
      onRevealSelected: opts.onRevealSelected,
      onToggleZen: opts.onToggleZen,
      onHideBar: opts.onHideBar,
    });
  }

  get api(): LabApi | undefined {
    return this.shell.play.win?.__lab;
  }

  /** Builds the lab and swaps the session inside the running page (or loads `/play` on first boot). */
  async load(script: LabScript): Promise<boolean> {
    const built = buildLabPack(script);
    const packId = labPackId(script);
    const level = built.pack.levels[0]!;
    writeDraftPack(built.pack);
    writeLabConfig(built.pack.manifest.id, built.config);
    this.live = null;
    this.linesSeen = 0;
    if (this.api?.swap && Boolean(this.shell.play.phase) && this.shell.play.phase !== 'boot') {
      this.shell.prepareSwap();
      if (this.shell.play.preservingFormFocus(() => this.api!.swap(built.pack.manifest.id, level.id))) {
        this.shell.play.flushTo(this.shell.logEl);
        this.refresh();
        return true;
      }
    }
    const { live } = await this.shell.load(`/play/${encodeURIComponent(packId)}/${encodeURIComponent(level.id)}?draft=1&lab=1&nointro=1`);
    if (live) this.refresh();
    return live;
  }

  /** Reads the level from the game again. */
  refresh(): LabInspect | null {
    this.live = this.api?.inspect() ?? null;
    return this.live;
  }

  /** One world tick, painted on the stage like a clock tick. */
  tick(): void {
    this.api?.tick();
    this.refresh();
  }

  /** Lines typed in the game terminal since the last call (for Record). */
  newLines(): ExecRecord[] {
    const log = this.api?.execLog();
    if (!log) return [];
    const fresh = log.entries.slice(Math.max(0, log.entries.length - (log.count - this.linesSeen)));
    this.linesSeen = log.count;
    return fresh;
  }
}
