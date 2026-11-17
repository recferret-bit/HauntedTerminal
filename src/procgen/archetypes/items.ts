/**
 * The developer's inventory: things he carries and holds out in his screen-right hand. Each item
 * stands on the floor in its own frame and names a `grip` socket; `vibecoder.ts` puts that socket in
 * his hand. The builders live in `./items/`; this file only registers them, in order.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { buildLantern } from './items/lantern.js';
import { buildLaptop } from './items/laptop.js';

ModelCatalog.register({
  id: 'item.lantern', category: 'item', label: 'Lantern',
  lore: 'The oil lantern he brought in from the desk. ls -a lights it, and dotfiles and hiding malware show.',
  build: buildLantern,
});
ModelCatalog.register({
  id: 'item.laptop', category: 'item', label: 'Laptop',
  lore: 'An old clamshell laptop with a carry handle. Opened, it runs a tiny desktop with code editors: the tool for coding tasks.',
  build: buildLaptop,
});
