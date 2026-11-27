import { FX_WORD_MAX_CHARS, fxWordUnsupported, type Subject } from '../subjects/index.js';
import type { LabOptions } from '../domain/options.js';
import { button, el } from './dom.js';

export interface FxControlsHooks {
  togglePlay(): void;
  step(delta: -1 | 1): void;
  scrub(tMs: number): void;
  toggleLayer(name: string): void;
  setWord(text: string | null): void;
}

/** Interactive workbench section shown while inspecting an FX preset: 12fps frame scrubber, Play/Pause/Step, layers, word preview. */
export class FxControlsPanel {
  readonly section: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly readout = el('span', 'lab-fx-readout', 'F 0/0 · 0 ms');
  private readonly range: HTMLInputElement;
  private readonly layersRow = el('div', 'lab-choice');
  private readonly wordInput: HTMLInputElement;
  private readonly wordWarn = el('p', 'lab-warn');
  private subjectId: string | null = null;
  private subjectRef: Subject | null = null;

  constructor(private readonly hooks: FxControlsHooks) {
    this.section = el('section', 'lab-section');
    this.section.hidden = true;

    this.playBtn = button('lab-btn', 'Pause', () => this.hooks.togglePlay());
    this.playBtn.setAttribute('aria-label', 'Play or pause FX');
    const prevBtn = button('lab-btn', '◀', () => this.hooks.step(-1));
    prevBtn.title = 'Step back one 12fps frame';
    prevBtn.setAttribute('aria-label', 'Step back one frame');
    const nextBtn = button('lab-btn', '▶', () => this.hooks.step(1));
    nextBtn.title = 'Step forward one 12fps frame';
    nextBtn.setAttribute('aria-label', 'Step forward one frame');

    const transport = el('div', 'lab-fx-transport');
    transport.append(this.playBtn, prevBtn, nextBtn, this.readout);

    this.range = el('input', 'lab-fx-range');
    this.range.type = 'range';
    this.range.min = '0';
    this.range.max = '10';
    this.range.step = '1';
    this.range.setAttribute('aria-label', 'FX frame scrubber');
    this.range.oninput = () => {
      const sub = this.subjectRef;
      const st = sub?.fxControl?.getState();
      if (!st) return;
      const stepMs = 1000 / Math.max(1, st.stepFps);
      const tMs = Math.min(st.totalMs, Math.round(Number(this.range.value) * stepMs));
      this.hooks.scrub(tMs);
    };

    this.wordInput = el('input', 'lab-fx-input');
    this.wordInput.type = 'text';
    this.wordInput.maxLength = FX_WORD_MAX_CHARS;
    this.wordInput.setAttribute('aria-label', 'Custom onomatopoeia preview text');
    this.wordInput.oninput = () => {
      const val = this.wordInput.value;
      this.updateWordWarn(val);
      this.hooks.setWord(val);
    };
    const clearWord = button('lab-btn', 'Reset', () => {
      const base = this.subjectRef?.fxControl?.getState().baseWord ?? '';
      this.wordInput.value = base;
      this.updateWordWarn(base);
      this.hooks.setWord(null);
    });
    clearWord.title = 'Restore preset onomatopoeia text';

    const wordRow = el('div', 'lab-fx-word-row');
    wordRow.append(this.wordInput, clearWord);
    this.wordWarn.hidden = true;

    this.section.append(
      el('h3', '', 'FX WORKBENCH'),
      transport,
      this.range,
      el('h4', 'lab-fx-sub', 'LAYERS'),
      this.layersRow,
      el('h4', 'lab-fx-sub', 'ONOMATOPOEIA PREVIEW'),
      wordRow,
      this.wordWarn,
    );
  }

  private updateWordWarn(raw: string): void {
    const cleaned = [...raw.trim()].map((ch) => (ch === 'x' ? 'x' : ch.toUpperCase())).join('');
    const bad = cleaned ? fxWordUnsupported(cleaned) : [];
    this.wordWarn.hidden = bad.length === 0;
    this.wordWarn.textContent = bad.length ? `Unsupported glyph(s): ${bad.join(' ')}` : '';
  }

  sync(opts: LabOptions, subject: Subject | null): void {
    this.subjectRef = subject;
    const ctrl = subject?.fxControl ?? null;
    this.section.hidden = !ctrl;
    if (!ctrl || !subject) {
      this.subjectId = null;
      return;
    }
    const st = ctrl.getState();
    const playing = opts.anim && opts.time === null;
    this.playBtn.textContent = playing ? 'Pause' : 'Play';
    this.playBtn.setAttribute('aria-pressed', String(playing));

    const maxFrames = Math.max(1, Math.round((st.totalMs * st.stepFps) / 1000));
    this.range.max = String(maxFrames);

    if (this.subjectId !== subject.id) {
      this.subjectId = subject.id;
      this.rebuildLayers(ctrl);
    } else {
      this.syncLayers(st.hiddenLayers);
    }
    if (document.activeElement !== this.wordInput) {
      this.wordInput.value = st.wordText;
      this.wordInput.placeholder = st.baseWord || 'CUSTOM WORD!';
      this.updateWordWarn(st.wordText);
    }
    this.syncFrame(subject, opts.time !== null ? opts.time * 1000 : st.tMs, playing);
  }

  syncFrame(subject: Subject | null, tMs: number, playing: boolean): void {
    const ctrl = subject?.fxControl;
    if (!ctrl || this.section.hidden) return;
    const st = ctrl.getState();
    const stepMs = 1000 / Math.max(1, st.stepFps);
    const maxFrames = Math.max(1, Math.round((st.totalMs * st.stepFps) / 1000));
    const frame = Math.min(maxFrames, Math.max(0, Math.round(st.tMs / stepMs)));
    if (document.activeElement !== this.range) this.range.value = String(frame);
    this.readout.textContent = `F ${String(frame).padStart(2, '0')}/${String(maxFrames).padStart(2, '0')} · ${Math.round(st.tMs)} ms (${st.stepFps}fps)`;
    this.playBtn.textContent = playing ? 'Pause' : 'Play';
    this.playBtn.setAttribute('aria-pressed', String(playing));
    void tMs;
  }

  private rebuildLayers(ctrl: NonNullable<Subject['fxControl']>): void {
    const hidden = new Set(ctrl.getState().hiddenLayers);
    const chips = ctrl.preset.layers.map((layer) => {
      const chip = button('lab-chip', `${layer.name} (${layer.role[0]})`, () => {
        this.hooks.toggleLayer(layer.name);
        this.syncLayers(ctrl.getState().hiddenLayers);
      });
      chip.dataset.layer = layer.name;
      chip.setAttribute('aria-pressed', String(!hidden.has(layer.name)));
      return chip;
    });
    this.layersRow.replaceChildren(...chips);
  }

  private syncLayers(hiddenNames: readonly string[]): void {
    const hidden = new Set(hiddenNames);
    for (const child of this.layersRow.querySelectorAll<HTMLElement>('[data-layer]')) {
      const name = child.dataset.layer ?? '';
      child.setAttribute('aria-pressed', String(!hidden.has(name)));
    }
  }
}
