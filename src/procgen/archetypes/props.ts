/**
 * Items and set dressing: data you can pick up (a document, a tar crate, a fuse) and the hardware
 * that furnishes rooms (chip, capacitor, heatsink, fan, cables, CRT, tombstone). The builders live in
 * `./props/`; this file only registers them, in order.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { buildGpuCard, buildGpuServer, buildRamBank, buildTransistor, buildWireLoom } from './props/components.js';
import { buildCoolerAio, buildCoolerTower, buildIndicator, buildWaterPipe } from './props/cooling.js';
import { buildCables, buildCapacitor, buildChip, buildCrt, buildFan, buildHeatsink } from './props/hardware.js';
import { buildFile, buildFuse, buildTar, buildTombstone } from './props/items.js';
import { buildBat, buildCobweb, buildSpider } from './props/kiroween.js';

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
ModelCatalog.register({
  id: 'prop.wire_loom', category: 'prop', label: 'Wire loom',
  lore: 'A bundled power & ribbon cable harness with dangling plugs. Set dressing.',
  build: buildWireLoom,
});
ModelCatalog.register({
  id: 'prop.gpu_card', category: 'prop', label: 'Discrete GPU',
  lore: 'A multi-fan discrete graphics card on colored textolite with copper heatpipes. Set dressing.',
  build: buildGpuCard,
});
ModelCatalog.register({
  id: 'prop.gpu_server', category: 'prop', label: 'Tensor GPU sled',
  lore: 'An enterprise SXM tensor accelerator sled on matte-black PCB with vapor-chamber fins. Set dressing.',
  build: buildGpuServer,
});
ModelCatalog.register({
  id: 'prop.ram_bank', category: 'prop', label: 'DIMM memory bank',
  lore: 'A multi-stick RAM bank mixing colored textolite PCBs and armored heatspreaders. Set dressing.',
  build: buildRamBank,
});
ModelCatalog.register({
  id: 'prop.transistor', category: 'prop', label: 'Transistor cluster',
  lore: 'TO-220 MOSFET and TO-92 transistor cans soldered onto amber phenolic textolite. Set dressing.',
  build: buildTransistor,
});
ModelCatalog.register({
  id: 'prop.indicator', category: 'prop', label: 'POST & telemetry indicator',
  lore: 'A diagnostic stand with 7-segment POST codes, LED bar-graph, and swinging VU dial. Set dressing.',
  build: buildIndicator,
});
ModelCatalog.register({
  id: 'prop.cooler_tower', category: 'prop', label: 'Tower heatsink cooler',
  lore: 'A copper-heatpipe tower air cooler with spinning blower fan. Set dressing.',
  build: buildCoolerTower,
});
ModelCatalog.register({
  id: 'prop.cooler_aio', category: 'prop', label: 'AIO liquid cooler',
  lore: 'An all-in-one liquid cooling radiator with dual fans, hoses, and coldplate pump. Set dressing.',
  build: buildCoolerAio,
});
ModelCatalog.register({
  id: 'prop.water_pipe', category: 'prop', label: 'Coolant water pipe',
  lore: 'A flanged coolant pipe manifold with glass sight-tube reservoir and shutoff valve. Set dressing.',
  build: buildWaterPipe,
});
ModelCatalog.register({
  id: 'prop.cobweb', category: 'prop', label: 'Solder cobweb',
  lore: 'A radial cobweb spun from silver solder wire across an upper wall corner. Kiroween set dressing.',
  build: buildCobweb,
});
ModelCatalog.register({
  id: 'prop.spider', category: 'prop', label: 'IC spider',
  lore: 'An 8-pin DIP chip and amber PCB abdomen dangling on a wire thread. Kiroween set dressing.',
  build: buildSpider,
});
ModelCatalog.register({
  id: 'prop.bat', category: 'prop', label: 'Circuit bat',
  lore: 'A folded matte-black PCB bat with copper ribs flapping in the upper shadows. Kiroween set dressing.',
  build: buildBat,
});
