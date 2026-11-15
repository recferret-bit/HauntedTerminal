import { paletteGroups, type PaletteEntry } from './catalog.js';
import type { AddSetupOptions } from './lab-model.js';

export interface PaletteDragTargets {
  grid: HTMLElement;
  sideBody: HTMLElement;
  stageEl: HTMLElement;
  onDrop: (entry: PaletteEntry, opts: AddSetupOptions) => void;
}

const STAGE_MIN_X = -1;
const STAGE_SPAN_X = 6;

function findPaletteEntry(id: string | null): PaletteEntry | undefined {
  if (!id) return undefined;
  return paletteGroups().flatMap((g) => g.entries).find((e) => e.id === id);
}

function sceneDropIndex(zone: HTMLElement, clientY: number): number {
  const rows = [...zone.querySelectorAll<HTMLElement>('.lab-row')];
  for (let i = 0; i < rows.length; i += 1) {
    const rect = rows[i]!.getBoundingClientRect();
    if (rect.height > 0 && clientY < rect.top + rect.height / 2) return i;
  }
  return rows.length;
}

function stageXFromPointer(stageEl: HTMLElement, clientX: number): number {
  const target = stageEl.querySelector<HTMLElement>('.pv-frame') ?? stageEl;
  const rect = target.getBoundingClientRect();
  const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0.5;
  return STAGE_MIN_X + ratio * STAGE_SPAN_X;
}

/**
 * Wires drag-and-drop from `.chip[data-palette]` onto either the Scene list (`[data-scene-drop]`, inserting at the hovered row)
 * or the Game Viewport (`stageEl`, mapping horizontal drop position to stage `x` for props). Click-to-place stays intact.
 */
export function bindPaletteDrag({ grid, sideBody, stageEl, onDrop }: PaletteDragTargets): void {
  let activeId: string | null = null;

  const readEntry = (e: DragEvent): PaletteEntry | undefined =>
    findPaletteEntry(activeId ?? (e.dataTransfer?.getData('text/plain') || null));

  const clearHighlights = (): void => {
    delete stageEl.dataset.dropOver;
    for (const el of sideBody.querySelectorAll<HTMLElement>('[data-drop-over]')) delete el.dataset.dropOver;
  };

  const finishDrag = (): void => {
    activeId = null;
    delete grid.dataset.paletteDrag;
    clearHighlights();
  };

  sideBody.addEventListener('dragstart', (e) => {
    const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-palette]');
    const id = chip?.getAttribute('data-palette') ?? null;
    if (!id || !findPaletteEntry(id)) return;
    activeId = id;
    grid.dataset.paletteDrag = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', id);
    }
  });

  window.addEventListener('dragend', finishDrag);

  stageEl.addEventListener('dragover', (e) => {
    if (!readEntry(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    stageEl.dataset.dropOver = 'stage';
  });
  stageEl.addEventListener('dragleave', (e) => {
    if (!stageEl.contains(e.relatedTarget as Node | null)) delete stageEl.dataset.dropOver;
  });
  stageEl.addEventListener('drop', (e) => {
    const entry = readEntry(e);
    finishDrag();
    if (!entry) return;
    e.preventDefault();
    onDrop(entry, { stageX: stageXFromPointer(stageEl, e.clientX) });
  });

  sideBody.addEventListener('dragover', (e) => {
    const zone = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-scene-drop]');
    if (!zone || !readEntry(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    for (const el of sideBody.querySelectorAll<HTMLElement>('[data-drop-over]')) {
      if (el !== zone) delete el.dataset.dropOver;
    }
    zone.dataset.dropOver = 'scene';
  });
  sideBody.addEventListener('dragleave', (e) => {
    const zone = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-scene-drop]');
    if (zone && !zone.contains(e.relatedTarget as Node | null)) delete zone.dataset.dropOver;
  });
  sideBody.addEventListener('drop', (e) => {
    const zone = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-scene-drop]');
    const entry = zone ? readEntry(e) : undefined;
    finishDrag();
    if (!zone || !entry) return;
    e.preventDefault();
    onDrop(entry, { index: sceneDropIndex(zone, e.clientY) });
  });
}
