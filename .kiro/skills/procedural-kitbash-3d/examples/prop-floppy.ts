/**
 * Worked example: `prop.floppy`, a 3.5" floppy disk leaning on the floor.
 *
 * This file is documentation. To use it for real, paste it into
 * `src/procgen/archetypes/props.ts` (the imports below are written for that folder).
 * It follows the workflow in ../SKILL.md step by step.
 */
import { ModelCatalog } from '../core/catalog.js';
import { makeRng } from '../core/rng.js';
import type { ModelSpec, PartSpec, Vec2 } from '../core/types.js';
import {
  greebleLabelPlate, kitBox, kitPlate, offsetParts, outlineRoundRect, SCREEN_LEFT, SCREEN_RIGHT, tiltParts,
} from '../kit/greebles.js';

function buildFloppy(seed: number): ModelSpec {
  // Seed changes taste (how far it leans, how many label lines), never identity.
  const rng = makeRng(seed);
  const S = 0.42; // a small item: under half a unit

  // 1. SILHOUETTE. Draw it on the page, centred on (0, 0). A floppy is a square with one cut corner,
  //    and the cut corner is what makes it a floppy at 24 px. Put it top screen-right: screen-right is −x.
  const R = SCREEN_RIGHT;
  const body: Vec2[] = [
    [-S / 2 * R, -S / 2], [S / 2 * R, -S / 2], [S / 2 * R, S / 2 - 0.06], [(S / 2 - 0.06) * R, S / 2], [-S / 2 * R, S / 2],
  ];

  // 2. PARTS, back to front. Each layer is 0.02 or more in front of the one behind it, so the ink
  //    line between them is drawn, and overlaps it in z, so nothing floats.
  let parts: PartSpec[] = [
    // 60%: the shell. Extrude + a small bevel is the standard relief body.
    kitPlate('shell', body, 0.05, 'rubber', [0, 0, 0], { bevel: 0.008 }),
    // 30%: the metal shutter along the top, with its window. The window is a decal: no ink shell.
    kitPlate('shutter', outlineRoundRect(0.2, 0.13, 0.01, 1), 0.02, 'solder', [0.03 * SCREEN_LEFT, S / 2 - 0.075, -0.03]),
    kitBox('window', [0.05, 0.09, 0.01], 'ink', [0.065 * SCREEN_LEFT, S / 2 - 0.075, -0.042], { outline: false }),
    // 10%: the paper label. A greeble does the plate and the ink text lines.
    ...greebleLabelPlate({ name: 'label', pos: [0, -0.07, -0.025], width: 0.3, height: 0.2, zone: 'paper', lines: rng.int(2, 3) }),
    // The write-protect hole, bottom screen-left.
    kitBox('tab', [0.04, 0.04, 0.01], 'ink', [(S / 2 - 0.04) * SCREEN_LEFT, -S / 2 + 0.04, -0.03], { outline: false }),
  ];

  // 3. GROUND IT. The outline was centred on 0, so lift it by half its height: feet at y = 0.
  parts = offsetParts(parts, [0, S / 2, 0]);
  // Lean it, pivoting on the bottom corner it leans toward, so that corner stays on the floor.
  const lean = rng.range(0.06, 0.16);
  parts = tiltParts(parts, lean, [-S / 2, 0]);

  return {
    id: 'prop.floppy', category: 'prop', label: 'Floppy disk', parts,
    // 4. SOCKETS: where the game hangs a name tag and spawns pickup sparks.
    sockets: { label: [0, S + 0.16, 0], fx: [0, S / 2, -0.06] },
    // 5. No anim tags and no signal zone: a prop does not glow or move. A pickup would add
    //    `animateParts(parts, { type: 'bob' })` and one pulsing `signal` part, plus tags: ['hover'].
  };
}

// 6. REGISTER. id is `<category>.<name>`; gameKey only when it replaces an existing actor.
ModelCatalog.register({
  id: 'prop.floppy', category: 'prop', label: 'Floppy disk',
  lore: 'A 3.5 inch floppy: a file small enough to carry. Set dressing for the storage attic.',
  build: buildFloppy,
});

// 7. Then, from the project root:
//      node scripts/harness/render-sheet.mjs prop.floppy --views --out scripts/harness/out/floppy.png
//      node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs prop.floppy --seeds 8 --strict
//    and look at the PNG, especially the small thumbnail in the bottom-left corner of the cell.
