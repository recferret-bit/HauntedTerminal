/**
 * Friendly cast (category `npc`): the Kiro Ghost companion and the old bearded coder at his rig.
 * The builders live in `./npc/`; this file only registers them, in order.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { buildGreybeardRig } from './npc/greybeard-rig.js';
import { buildKiroGhost } from './npc/kiro-ghost.js';

ModelCatalog.register({
  id: 'npc.kiro_ghost', category: 'npc', label: 'Kiro Ghost',
  lore: 'kiro.d: your loyal self-hosted .gguf Ghost companion running on local VRAM. Scans rooms and cracks Cloud locks.',
  build: buildKiroGhost,
});
ModelCatalog.register({
  id: 'npc.greybeard_rig', category: 'npc', label: 'Old Bearded Coder & Matrix Rig',
  lore: 'A veteran enterprise coder with a chest-length grey beard and lit cigarette, hammering bare-metal code on a Matrix-display CRT server rig to host open-weight .gguf models.',
  build: buildGreybeardRig,
});
