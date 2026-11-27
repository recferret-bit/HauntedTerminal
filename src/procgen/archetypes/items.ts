/**
 * The developer's inventory: things he carries and holds out in his screen-right hand. Each item
 * stands on the floor in its own frame and names a `grip` socket; `vibecoder.ts` puts that socket in
 * his hand. The builders live in `./items/`; this file registers them from the items contract.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import { ITEMS, type ItemId } from '../../contracts/inventory.js';
import { ModelCatalog } from '../core/catalog.js';
import type { ModelSpec } from '../core/types.js';
import { buildTubeTransistor } from './items/tube-transistor.js';
import { buildLaptop } from './items/laptop.js';
import { buildManual } from './items/manual.js';
import { buildMap } from './items/map.js';
import { buildTerminal } from './items/terminal.js';
import { buildTensorGpu } from './items/tensor-gpu.js';
import { buildVramModule } from './items/vram-module.js';

export const ITEM_BUILDERS: Record<ItemId, (seed: number) => ModelSpec> = {
  tube_transistor: buildTubeTransistor,
  terminal: buildTerminal,
  laptop: buildLaptop,
  manual: buildManual,
  map: buildMap,
};

for (const def of Object.values(ITEMS)) {
  ModelCatalog.register({
    id: def.model,
    category: 'item',
    label: def.label.charAt(0).toUpperCase() + def.label.slice(1),
    lore: def.lore,
    build: ITEM_BUILDERS[def.id],
  });
}

/**
 * Items with a model but no hero hold model. Until `ITEM_IDS` and `ITEMS` (src/contracts/inventory.ts)
 * list them (spec tensor-gpu-hub-ritual, task 2) they register here with their own text; once the
 * contract lists them the loop above registers them and this block does nothing.
 */
const PICKUP_ONLY_ITEMS = [
  { id: 'tensor_gpu', label: 'Tensor GPU', lore: 'A PCIe graphics card with a ribbed heatsink and a die of glowing tensor cells. Kiro can load open-weight models with it.', build: buildTensorGpu },
  { id: 'vram_module', label: 'VRAM module', lore: 'A small memory card with three chips and gold pins. Each one adds one extra skill charge.', build: buildVramModule },
] as const;

for (const item of PICKUP_ONLY_ITEMS) {
  if (Object.prototype.hasOwnProperty.call(ITEMS, item.id)) continue;
  ModelCatalog.register({ id: `item.${item.id}`, category: 'item', label: item.label, lore: item.lore, build: item.build });
}
