import type { PackIssue } from '../chapters/validate-pack.js';
import { blankUnion } from '../editor-core/form.js';
import { FileBaselineTracker } from '../editor-core/file-tracker.js';
import type { PaletteEntry } from './catalog.js';
import { checkLab } from './lab-check.js';
import type { LabScript, LabStep, LabStepKind } from './lab-types.js';
import { STEP_VARIANTS } from './schema.js';
import { exportLabText, validateLab } from './store.js';

/** `setup[3]` or `steps[2]`, and anything below it (`setup[3].hints[1]`). */
const ITEM = /^(setup|steps)\[(\d+)\]/;

/** Where an item path points: the setup object or script step it belongs to. */
export function itemOf(path: string | null): { list: 'setup' | 'steps'; index: number } | null {
  const m = path ? ITEM.exec(path) : null;
  return m ? { list: m[1] as 'setup' | 'steps', index: Number(m[2]) } : null;
}

export interface AddSetupOptions {
  /** Insertion index in `setup` (defaults to the end). */
  index?: number;
  /** Horizontal stage coordinate (`[-1, 5]`) when dropping onto the viewport; applied to `prop` entries. */
  stageX?: number;
}

const fileOf = (id: string): string => `${id}.lab.json`;

/**
 * The open lab: its script (the single source of truth), the selection as an item path (`setup[i]`, `steps[i]`, or null for
 * the lab settings), its issues, and its baseline in the repo (`FileBaselineTracker`, like the editors' models).
 * No DOM: the app draws it.
 */
export class LabModel {
  selectedPath: string | null = null;
  issues: PackIssue[] = [];
  private readonly repo = new FileBaselineTracker<'lab'>((v) => exportLabText(v as LabScript));
  private inRepo = false;

  constructor(public script: LabScript) {
    this.refreshIssues();
  }

  get id(): string {
    return this.script.id;
  }

  // ---- selection ---------------------------------------------------------------------------------------------------

  get selectedSetup(): number | null {
    const it = itemOf(this.selectedPath);
    return it?.list === 'setup' && it.index < this.script.setup.length ? it.index : null;
  }

  get selectedStep(): number | null {
    const it = itemOf(this.selectedPath);
    return it?.list === 'steps' && it.index < this.script.steps.length ? it.index : null;
  }

  select(path: string | null): void {
    this.selectedPath = path;
  }

  /** A few words for the selection pill: `enemy virus-1`, `step 3`, or null for the lab settings. */
  selectionLabel(): string | null {
    const step = this.selectedStep;
    if (step !== null) return `step ${step + 1}`;
    const i = this.selectedSetup;
    const op = i === null ? undefined : this.script.setup[i];
    if (!op) return null;
    const name = 'id' in op ? op.id : 'path' in op ? op.path : 'agent' in op ? op.agent : '';
    return `${op.op} ${name}`.trim();
  }

  // ---- edits -------------------------------------------------------------------------------------------------------

  /** Places a palette entry (and anything it brings, like the file a patch chip patches) and selects it. */
  add(entry: PaletteEntry, opts?: AddSetupOptions): number {
    const items = entry.make(this.script);
    if (opts?.stageX !== undefined && items[0]?.op === 'prop') {
      items[0] = { ...items[0], x: Math.round(opts.stageX * 10) / 10 };
    }
    const at = opts?.index === undefined ? this.script.setup.length : Math.max(0, Math.min(this.script.setup.length, opts.index));
    this.script.setup.splice(at, 0, ...items);
    this.selectedPath = `setup[${at}]`;
    return at;
  }

  removeSetup(index: number): void {
    this.script.setup.splice(index, 1);
    this.selectedPath = null;
  }

  addStep(op: LabStepKind): number {
    this.script.steps.push(blankUnion(STEP_VARIANTS(), op, 'op') as unknown as LabStep);
    const index = this.script.steps.length - 1;
    this.selectedPath = `steps[${index}]`;
    return index;
  }

  removeStep(index: number): void {
    this.script.steps.splice(index, 1);
    this.selectedPath = null;
  }

  /** Moves a step by one; the selection follows it. Returns the new index, or null at an end. */
  moveStep(index: number, delta: -1 | 1): number | null {
    const to = index + delta;
    if (to < 0 || to >= this.script.steps.length) return null;
    const [step] = this.script.steps.splice(index, 1);
    this.script.steps.splice(to, 0, step!);
    this.selectedPath = `steps[${to}]`;
    return to;
  }

  /** Replaces every step (the JSON tab). Returns why it was refused, or null. */
  replaceSteps(steps: unknown): string | null {
    if (!Array.isArray(steps)) return 'the script must be a JSON list';
    const problems = validateLab({ ...this.script, steps: steps as LabStep[] });
    if (problems.length > 0) return problems[0]!;
    this.script.steps = steps as LabStep[];
    this.selectedPath = null;
    return null;
  }

  /** Replaces the whole document (the JSON tab). The id cannot change here. */
  replaceScript(next: LabScript): string | null {
    if (next.id !== this.script.id) return 'the id cannot change here: use Duplicate to copy a lab under a new id';
    const problems = validateLab(next);
    if (problems.length > 0) return problems[0]!;
    this.script = next;
    this.selectedPath = null;
    return null;
  }

  /** What the game is built from; a change means the level must reload. Steps are not part of it. */
  sceneFingerprint(): string {
    const { driver, room, player, clock, enemyFire, setup } = this.script;
    return JSON.stringify({ driver: driver ?? 'chapter', room, player, clock, enemyFire, setup });
  }

  refreshIssues(): void {
    this.issues = checkLab(this.script);
  }

  // ---- the repo ----------------------------------------------------------------------------------------------------

  /** The repo has this lab with this content and hash (opened from it, saved to it, or found on start). */
  setRepoBaseline(json: LabScript, etag: string): void {
    this.repo.reset();
    this.repo.register('lab', fileOf(this.id), json, etag);
    this.inRepo = true;
  }

  get repoEtag(): string | undefined {
    return this.repo.etagOf('lab');
  }

  /** `new`: not in the repo; `dirty`: differs from the repo; `clean`: the same. */
  repoState(): 'new' | 'dirty' | 'clean' {
    if (!this.inRepo) return 'new';
    return this.repo.isDirty('lab', this.script) ? 'dirty' : 'clean';
  }

  /** The repo version as it was when last opened or saved, for Revert. */
  repoVersion(): LabScript | undefined {
    return this.inRepo ? this.repo.parseBaseline<LabScript>('lab') : undefined;
  }

  /** True when the repo file changed (or vanished) after it was opened or saved here. */
  changedInRepo(diskEtags: Record<string, string>): boolean {
    if (!this.inRepo) return false;
    return !(fileOf(this.id) in diskEtags) || this.repo.changedDiskPaths(diskEtags).length > 0;
  }
}
