import type { ClockMode } from '../subjects/part-animator.js';
import { assignOption } from '../domain/options-io.js';
import type { LabOptions } from '../domain/options.js';

/** What has to be redone after an option change. */
export interface Dirty {
  layout: boolean;
  subjects: boolean;
  paint: boolean;
  info: boolean;
}

/** Options that change what is on the page, not just how it is painted. */
const LAYOUT_KEYS = ['inspect', 'tab', 'category', 'ui'] as const;
const SUBJECT_KEYS = ['seed', 'ink', 'tex'] as const;

/** The lab's mutable state: the options, the dirty flags and the animation clock. No DOM, no Three.js. */
export class LabState {
  readonly dirty: Dirty = { layout: true, subjects: false, paint: true, info: true };
  clock = 0;
  frames = 0;

  constructor(readonly opts: LabOptions) {}

  /** Apply one option and mark what has to be redone. Returns false for an unknown key. */
  set(key: string, value: unknown): boolean {
    const before = { ...this.opts };
    if (!assignOption(this.opts, key, value)) return false;
    const now = this.opts;
    if (LAYOUT_KEYS.some((k) => now[k] !== before[k]) || (!now.inspect && now.scale !== before.scale)) this.dirty.layout = true;
    if (SUBJECT_KEYS.some((k) => now[k] !== before[k])) this.dirty.subjects = true;
    this.dirty.paint = true;
    this.dirty.info = true;
    return true;
  }

  get time(): number {
    return this.opts.time ?? this.clock;
  }

  get clockMode(): ClockMode {
    return !this.opts.anim ? 'rest' : this.opts.time !== null ? 'seek' : 'run';
  }

  /** The clock runs only when animation is on and no time is pinned. */
  get clockRunning(): boolean {
    return this.opts.anim && this.opts.time === null;
  }
}
