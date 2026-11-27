import type { SfxId } from '../audio/catalog.js';
import { LOOP_CUE_IDS } from '../audio/config.js';
import { LOOP_TAKES } from '../audio/loop-takes.js';
import { h } from '../editor-core/dom.js';
import { defaultLoopGainFor } from './catalog-meta.js';

export interface MixerHandle {
  el: HTMLElement;
  setLoop(id: SfxId, on: boolean, gain?: number): void;
  activeLoops(): Record<string, { on: boolean; gain: number }>;
}

export function createMixerPanel(
  onToggleLoop: (id: SfxId, on: boolean) => void,
  onPlayTake: (id: SfxId) => void,
): MixerHandle {
  const state = new Map<SfxId, { on: boolean; gain: number }>();
  for (const id of LOOP_CUE_IDS) state.set(id, { on: false, gain: defaultLoopGainFor(id) });

  const rows = LOOP_CUE_IDS.map((id) => {
    const cur = state.get(id)!;
    const toggle = h('button', { type: 'button', class: 'al-chip', 'data-loop-toggle': id, 'aria-pressed': 'false' }, 'Off');
    const gainReadout = h('span', {}, cur.gain.toFixed(2));
    const slider = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.01',
      value: String(cur.gain),
      'aria-label': `${id} reference gain`,
    }) as HTMLInputElement;

    const syncRow = (): void => {
      const s = state.get(id)!;
      toggle.textContent = s.on ? 'On' : 'Off';
      toggle.setAttribute('aria-pressed', String(s.on));
      slider.value = String(s.gain);
      gainReadout.textContent = s.gain.toFixed(2);
    };

    toggle.onclick = () => {
      const next = !state.get(id)!.on;
      state.get(id)!.on = next;
      syncRow();
      onToggleLoop(id, next);
    };
    slider.oninput = () => {
      state.get(id)!.gain = Number(slider.value);
      gainReadout.textContent = Number(slider.value).toFixed(2);
    };

    return { id, row: h('div', { class: 'al-mix-row' }, h('span', {}, id), toggle, slider, gainReadout), syncRow };
  });

  const takeSections = Object.entries(LOOP_TAKES).flatMap(([loopId, takes]) => [
    h('span', { class: 'al-note' }, `${loopId} playlist takes (${takes.length}):`),
    h(
      'div',
      { class: 'al-btn-row' },
      ...takes.map((t, idx) =>
        h('button', { type: 'button', class: 'al-chip', 'data-take': t, onclick: () => onPlayTake(t) }, `#${idx + 1}`),
      ),
    ),
  ]);

  const el = h(
    'section',
    { class: 'al-card', 'aria-label': 'LOOP_TAKES and LOOP_GAINS mixer' },
    h('h3', {}, 'LOOP_TAKES & LOOP_GAINS Mixer'),
    ...rows.map((r) => r.row),
    ...takeSections,
  );

  return {
    el,
    setLoop(id, on, gain) {
      const entry = state.get(id);
      if (!entry) return;
      entry.on = on;
      if (gain !== undefined && Number.isFinite(gain)) entry.gain = Math.max(0, Math.min(1, gain));
      rows.find((r) => r.id === id)?.syncRow();
      onToggleLoop(id, on);
    },
    activeLoops: () => Object.fromEntries([...state.entries()].map(([k, v]) => [k, { ...v }])),
  };
}
