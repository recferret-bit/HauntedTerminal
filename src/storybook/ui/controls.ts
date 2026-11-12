import { bgColor, bgLabel } from '../domain/backgrounds.js';
import { BG_IDS, PALETTE_NAMES, STATE_IDS, type LabOptions, type OptionKey } from '../domain/options.js';
import { button, el } from './dom.js';

export interface ControlHooks {
  set(key: OptionKey | 'post', value: unknown): void;
  strike(): void;
  reset(): void;
}

interface ToggleDef {
  key: OptionKey;
  label: string;
  hint: string;
}

const RENDER_TOGGLES: ToggleDef[] = [
  { key: 'pixel', label: 'Pixel-art pass', hint: 'Bayer quantizer, 2 px cells, COMIX ramp' },
  { key: 'crt', label: 'CRT pass', hint: 'Scanlines, grain, vignette' },
  { key: 'ink', label: 'Ink shells', hint: 'Rebuild with inkWeight 0 when off' },
  { key: 'tex', label: 'Textures', hint: 'Albedo maps named by parts' },
  { key: 'anim', label: 'Animation', hint: 'Off freezes the clock at the rest pose' },
];

const TEST_TOGGLES: ToggleDef[] = [
  { key: 'silhouette', label: 'Silhouette', hint: 'Flat ink on paper: the readability test' },
  { key: 'lantern', label: 'Lantern dark', hint: 'Dim room, lantern cone follows the pointer' },
  { key: 'flash', label: 'Hold flash', hint: 'Lightning uniform held on, for screenshots' },
  { key: 'sockets', label: 'Sockets', hint: 'Labelled attach points' },
  { key: 'plinth', label: 'Plinth', hint: 'The floor strip actors stand on' },
  { key: 'guides', label: 'Guides', hint: 'Ground line and vibecoder height (1.6)' },
];

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const box = el('section', 'lab-section');
  box.append(el('h3', '', title), ...children);
  return box;
}

/** The control column. It owns no state: it reports changes through hooks and redraws from sync(). */
export class Controls {
  readonly info = el('div', 'lab-info');
  private readonly syncers: ((opts: LabOptions) => void)[] = [];

  constructor(host: HTMLElement, private readonly hooks: ControlHooks) {
    const strike = button('lab-btn lab-btn-hot', 'Lightning flash', () => hooks.strike());
    const reset = button('lab-btn', 'Reset options', () => hooks.reset());

    host.replaceChildren(
      section('RENDER', this.toggles(RENDER_TOGGLES)),
      section('PIXEL PALETTE', this.palette()),
      section('READ TESTS', this.toggles(TEST_TOGGLES), strike),
      section('BACKGROUND', this.backgrounds()),
      section('SCALE', this.scale()),
      section('STATE', this.states()),
      section('SEED', this.seed()),
      section('DEBUG YAW', this.yaw()),
      section('INFO', this.info),
      reset,
    );
  }

  sync(opts: LabOptions): void {
    this.syncers.forEach((fn) => fn(opts));
  }

  private toggles(defs: ToggleDef[]): HTMLElement {
    const grid = el('div', 'lab-toggles');
    for (const def of defs) {
      let on = false;
      const btn = button('lab-toggle', '', () => this.hooks.set(def.key, !on));
      btn.title = def.hint;
      btn.setAttribute('role', 'switch');
      btn.append(el('i'), el('span', '', def.label));
      this.syncers.push((opts) => {
        on = opts[def.key] === true;
        btn.setAttribute('aria-checked', String(on));
      });
      grid.append(btn);
    }
    return grid;
  }

  private choice<T extends string>(values: readonly T[], label: (v: T) => string, pick: (v: T) => void, current: (opts: LabOptions) => string, paint?: (btn: HTMLButtonElement, v: T) => void): HTMLElement {
    const row = el('div', 'lab-choice');
    for (const value of values) {
      const btn = button('lab-chip', label(value), () => pick(value));
      paint?.(btn, value);
      this.syncers.push((opts) => btn.setAttribute('aria-pressed', String(current(opts) === value)));
      row.append(btn);
    }
    return row;
  }

  private backgrounds(): HTMLElement {
    return this.choice(BG_IDS, (v) => bgLabel(v), (v) => this.hooks.set('bg', v), (o) => o.bg, (btn, v) => {
      const sw = el('i', 'lab-swatch');
      sw.style.background = `#${bgColor(v).toString(16).padStart(6, '0')}`;
      btn.prepend(sw);
    });
  }

  private scale(): HTMLElement {
    const labels = { fit: 'fit', game: 'game 58 px/unit' } as const;
    return this.choice(['fit', 'game'] as const, (v) => labels[v], (v) => this.hooks.set('scale', v), (o) => String(o.scale));
  }

  private palette(): HTMLElement {
    return this.choice(PALETTE_NAMES, (v) => (v === 'FULL' ? 'FULL (game)' : v), (v) => this.hooks.set('palette', v), (o) => PALETTE_NAMES[o.palette] ?? 'FULL');
  }

  private states(): HTMLElement {
    return this.choice(STATE_IDS, (v) => v, (v) => this.hooks.set('state', v), (o) => o.state);
  }

  private seed(): HTMLElement {
    const row = el('div', 'lab-stepper');
    let seed = 1;
    const down = button('lab-btn', '−', () => this.hooks.set('seed', Math.max(0, seed - 1)));
    const up = button('lab-btn', '+', () => this.hooks.set('seed', seed + 1));
    const value = el('b', '', '1');
    this.syncers.push((opts) => {
      seed = opts.seed;
      value.textContent = `seed ${seed}`;
    });
    row.append(down, value, up);
    return row;
  }

  private yaw(): HTMLElement {
    const box = el('div', 'lab-yaw');
    const input = el('input');
    input.type = 'range';
    input.min = '-40';
    input.max = '40';
    input.step = '1';
    const label = el('span', '', '0°');
    const zero = button('lab-btn', '0', () => this.hooks.set('yaw', 0));
    input.oninput = () => this.hooks.set('yaw', Number(input.value));
    this.syncers.push((opts) => {
      input.value = String(opts.yaw);
      label.textContent = `${opts.yaw}°`;
    });
    const row = el('div', 'lab-yaw-row');
    row.append(input, label, zero);
    box.append(row, el('p', 'lab-warn', 'Not how the game sees it. The game camera never turns: use this only to check depth, then set it back to 0.'));
    return box;
  }
}
