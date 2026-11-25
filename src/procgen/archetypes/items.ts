/**
 * The developer's inventory: things he carries and holds out in his screen-right hand. Each item
 * stands on the floor in its own frame and names a `grip` socket; `vibecoder.ts` puts that socket in
 * his hand. The builders live in `./items/`; this file registers them from the items contract.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import { ITEMS, type ItemId } from '../../contracts/inventory.js';
import { ModelCatalog } from '../core/catalog.js';
import type { ModelSpec } from '../core/types.js';
import { buildLantern } from './items/lantern.js';
import { buildLaptop } from './items/laptop.js';
import { buildManual } from './items/manual.js';
import { buildMap } from './items/map.js';
import { buildTerminal } from './items/terminal.js';

export const ITEM_BUILDERS: Record<ItemId, (seed: number) => ModelSpec> = {
  lantern: buildLantern,
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
