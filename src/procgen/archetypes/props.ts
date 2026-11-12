/**
 * Items and set dressing: data you can pick up (a document, a tar crate, a fuse) and the hardware
 * that furnishes rooms (chip, capacitor, heatsink, fan, cables, CRT, tombstone). The builders live in
 * `./props/`; this file only registers them, in order.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { buildCables, buildCapacitor, buildChip, buildCrt, buildFan, buildHeatsink } from './props/hardware.js';
import { buildFile, buildFuse, buildTar, buildTombstone } from './props/items.js';

ModelCatalog.register({
  id: 'prop.file', category: 'prop', label: 'File', gameKey: 'item_scroll',
  lore: 'A document: a paper card with a folded corner and three ink lines. Something to cat.',
  build: buildFile,
});
ModelCatalog.register({
  id: 'prop.tar', category: 'prop', label: 'Tar crate', gameKey: 'crate_bridge',
  lore: 'heavy_plank.tar: a strapped crate of stacked platters, long enough to bridge a gap in the bus.',
  build: buildTar,
});
ModelCatalog.register({
  id: 'prop.fuse', category: 'prop', label: 'Fuse',
  lore: '.spare_fuse / .power_on: a glass fuse with gold caps. A hidden item.',
  build: buildFuse,
});
ModelCatalog.register({
  id: 'prop.chip', category: 'prop', label: 'DIP chip',
  lore: 'A DIP chip on its pin legs. Set dressing.',
  build: buildChip,
});
ModelCatalog.register({
  id: 'prop.capacitor', category: 'prop', label: 'Capacitor',
  lore: 'An electrolytic capacitor can with a polarity stripe. Set dressing that reads as a pillar.',
  build: buildCapacitor,
});
ModelCatalog.register({
  id: 'prop.heatsink', category: 'prop', label: 'Heatsink',
  lore: 'A finned heatsink block. Set dressing that reads as a radiator or a pipe organ.',
  build: buildHeatsink,
});
ModelCatalog.register({
  id: 'prop.fan', category: 'prop', label: 'Case fan',
  lore: 'A case fan in a square frame, blades turning. Set dressing for the cooling furnace.',
  build: buildFan,
});
ModelCatalog.register({
  id: 'prop.cables', category: 'prop', label: 'Cable cobweb',
  lore: 'Ribbon cables draped like cobwebs, with loose leads that sway. Hangs from the top of a room.',
  build: buildCables,
});
ModelCatalog.register({
  id: 'prop.crt', category: 'prop', label: 'Dead CRT',
  lore: 'A dead CRT monitor with a cracked glass screen. Floor 1, the storage attic.',
  build: buildCrt,
});
ModelCatalog.register({
  id: 'prop.tombstone', category: 'prop', label: 'Log tombstone',
  lore: 'A log tombstone: a chip package stood on end with FATAL etched into it. Floor 2, the firewall crypt.',
  build: buildTombstone,
});
