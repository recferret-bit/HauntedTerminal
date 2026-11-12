import * as THREE from 'three';
import { CELL_UNITS } from '../domain/framing.js';
import { DEFAULT_OPTIONS, type LabOptions } from '../domain/options.js';
import { writeOptions } from '../domain/options-io.js';
import { LabStage } from '../stage/lab-stage.js';
import { itemsFor, tabOf } from '../subjects/catalog-items.js';
import { buildSubjectById } from '../subjects/index.js';
import { Controls } from '../ui/controls.js';
import { el } from '../ui/dom.js';
import { Gallery } from '../ui/gallery.js';
import { InspectView } from '../ui/inspect-view.js';
import { buildShell, showErrors, type Shell } from '../ui/shell.js';
import { buildTopBar } from '../ui/top-bar.js';
import { galleryPpu, paintGallery } from './gallery-painter.js';
import { LabState } from './lab-state.js';
import { loadProcgen, type LoadReport } from './loader.js';
import { SettleGate } from './settle-gate.js';

const MAX_PIXEL_RATIO = 1.75;
const MIN_CELL_PX = 120;
const MAX_CELL_PX = 420;
/** Longest frame step, so a stalled tab does not fast-forward the clock. */
const MAX_DT = 0.05;

/** Storybook: wires the stage, the gallery, the inspector and the controls to the options. */
export class LabApp {
  readonly state: LabState;
  readonly gate = new SettleGate();
  report: LoadReport = { loaded: [], errors: [] };
  stage: LabStage | null = null;
  gallery: Gallery | null = null;
  inspect: InspectView | null = null;
  controls: Controls | null = null;
  fatal: string | null = null;
  private readonly shell: Shell;
  private lastNow = 0;

  constructor(root: HTMLElement, opts: LabOptions, private readonly bootParams: URLSearchParams) {
    this.state = new LabState(opts);
    this.shell = buildShell(root);
  }

  get opts(): LabOptions {
    return this.state.opts;
  }

  get errorLines(): string[] {
    return [...(this.fatal ? [this.fatal] : []), ...this.report.errors];
  }

  /** Apply one option, mark what to redo, keep the URL and the controls in step. */
  setOption(key: string, value: unknown): boolean {
    if (!this.state.set(key, value)) return false;
    this.gate.invalidate();
    history.replaceState(null, '', this.hrefWith({}));
    this.controls?.sync(this.opts);
    return true;
  }

  hrefWith(change: Partial<LabOptions>): string {
    return `${location.pathname}${writeOptions({ ...this.opts, ...change }, this.bootParams)}`;
  }

  async boot(): Promise<void> {
    this.startStage();
    this.report = await loadProcgen();
    if (this.bootParams.get('fixtures') === '1') (await import('../fixtures.js')).registerFixtures();
    this.selectTabOfInspected();
    if (!this.stage) {
      this.shell.main.replaceChildren(this.shell.errors);
      showErrors(this.shell.errors, this.errorLines);
      this.gate.releaseAll();
      return;
    }
    this.mountViews(this.stage);
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    requestAnimationFrame((now) => this.frame(now));
  }

  /** Move inspected-id options (`?inspect=tex.x`) onto the tab that owns the id. */
  private selectTabOfInspected(): void {
    const id = this.opts.inspect;
    const tab = id ? tabOf(id) : null;
    if (tab && tab !== 'models') this.opts.tab = tab;
  }

  private startStage(): void {
    const wanted = Number(this.bootParams.get('dpr'));
    const pixelRatio = Math.min(wanted > 0 ? wanted : window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    try {
      this.stage = new LabStage(pixelRatio);
    } catch (err) {
      this.fatal = `WebGL renderer failed to start: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private mountViews(stage: LabStage): void {
    this.inspect = new InspectView(stage);
    this.gallery = new Gallery(this.shell.grid, (id) => this.hrefWith({ inspect: id }), (id) => this.setOption('inspect', id));
    this.controls = new Controls(this.shell.side, {
      set: (key, value) => {
        this.setOption(key, value);
      },
      strike: () => stage.strike(new THREE.Vector3(...this.strikePoint())),
      reset: () => this.resetOptions(),
    });
  }

  private strikePoint(): [number, number, number] {
    return this.opts.inspect && this.inspect ? this.inspect.strikePoint() : [-0.6, 0.02, 0.6];
  }

  private resetOptions(): void {
    const keep = { inspect: this.opts.inspect, tab: this.opts.tab, category: this.opts.category };
    Object.assign(this.opts, DEFAULT_OPTIONS, keep);
    this.setOption('inspect', keep.inspect);
    this.state.dirty.layout = true;
    this.state.dirty.subjects = true;
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.opts.inspect || ev.target instanceof HTMLInputElement) return;
    if (ev.key === 'ArrowRight') this.step(1);
    else if (ev.key === 'ArrowLeft') this.step(-1);
    else if (ev.key === 'Escape') this.setOption('inspect', null);
  }

  /** Inspect the previous or next item of the current tab. */
  private step(delta: number): void {
    const list = itemsFor(this.opts);
    const at = list.findIndex((i) => i.id === this.opts.inspect);
    if (at < 0 || !list.length) return;
    this.setOption('inspect', list[(at + delta + list.length) % list.length]!.id);
  }

  // ---- layout: what is on the page -------------------------------------------------------------

  private layout(): void {
    const { stage, gallery, inspect } = this;
    if (!stage || !gallery || !inspect) return;
    this.state.dirty.layout = false;
    this.state.dirty.subjects = false;
    this.shell.root.classList.toggle('lab-no-ui', !this.opts.ui);
    this.shell.bar.replaceChildren(...buildTopBar(this.opts, { href: (c) => this.hrefWith(c), set: (k, v) => void this.setOption(k, v) }));
    showErrors(this.shell.errors, this.errorLines);
    inspect.mounted?.dispose();
    if (this.opts.inspect) this.layoutInspect(gallery, inspect, this.opts.inspect);
    else this.layoutGallery(gallery, inspect, stage);
    this.controls?.sync(this.opts);
  }

  private layoutInspect(gallery: Gallery, inspect: InspectView, id: string): void {
    gallery.clear();
    this.mountInspected(inspect, id);
    this.shell.main.replaceChildren(this.shell.errors, inspect.root);
  }

  private layoutGallery(gallery: Gallery, inspect: InspectView, stage: LabStage): void {
    inspect.mount(null, null, '');
    const cellPx = Math.round(Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, CELL_UNITS * galleryPpu(this.opts))));
    gallery.layout(itemsFor(this.opts), cellPx, stage.pixelRatio, this.emptyText());
    this.shell.main.replaceChildren(this.shell.errors, this.shell.grid);
  }

  private emptyText(): string {
    const { tab, category } = this.opts;
    if (tab === 'textures') return 'TextureCatalog is empty. Textures register in src/procgen/textures/.';
    if (tab === 'fx') return 'No FX presets. They register in src/procgen/fx/presets.ts (FxCatalog).';
    const where = category === 'all' ? '' : ` in category "${category}"`;
    return `No models${where}. Models register in src/procgen/archetypes/. Add ?fixtures=1 to load the lab's own test fixtures.`;
  }

  private mountInspected(inspect: InspectView, id: string): void {
    const { opts } = this;
    const built = buildSubjectById(id, { seed: opts.seed, ink: opts.ink, tex: opts.tex });
    inspect.mount(built.subject, built.error, id);
  }

  /** Seed, ink or texture option changed: drop what was built. */
  private rebuildSubjects(): void {
    this.state.dirty.subjects = false;
    if (this.opts.inspect && this.inspect) {
      this.inspect.mounted?.dispose();
      this.mountInspected(this.inspect, this.opts.inspect);
    } else {
      this.gallery?.invalidate();
    }
  }

  // ---- frame loop ------------------------------------------------------------------------------

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const { stage, gallery, inspect } = this;
    if (!stage || !gallery || !inspect) return;
    const { state, opts } = this;
    const dt = Math.min(MAX_DT, this.lastNow ? (now - this.lastNow) / 1000 : 0.016);
    this.lastNow = now;
    if (state.clockRunning) state.clock += dt;
    stage.tick(dt);
    stage.pixelOn = opts.pixel;
    stage.crtOn = opts.crt;
    stage.setPalette(opts.palette);
    if (state.dirty.layout) this.layout();
    if (state.dirty.subjects) this.rebuildSubjects();

    const complete = opts.inspect ? this.drawInspect(inspect) : this.drawGallery(stage, gallery);
    state.dirty.paint = false;
    state.frames++;
    this.gate.frameDrawn(complete);
  }

  private drawInspect(inspect: InspectView): boolean {
    const { state } = this;
    inspect.render(this.opts, state.time, state.clockMode);
    if (state.dirty.info && this.controls) {
      state.dirty.info = false;
      this.controls.info.replaceChildren(inspect.info());
    }
    return true;
  }

  private drawGallery(stage: LabStage, gallery: Gallery): boolean {
    const { state, opts } = this;
    const live = state.clockRunning || stage.flashActive;
    const complete = paintGallery({ stage, gallery, opts, time: state.time, mode: state.clockMode, live, repaintAll: state.dirty.paint });
    if (state.dirty.info && this.controls) {
      state.dirty.info = false;
      const hint = `${gallery.cells.length} panels at one shared scale. Open a panel for parts, triangles, bounds and zones.`;
      this.controls.info.replaceChildren(el('p', 'lab-hint', hint));
    }
    return complete;
  }
}
