#!/usr/bin/env node
// Contact sheet of procedural models as the game camera sees them, drawn in software (no browser, no GPU).
// Read the PNG it writes to judge silhouette, cel bands, palette and ink before you open the real game.
//
//   node scripts/harness/render-sheet.mjs --all
//   node scripts/harness/render-sheet.mjs malware.worm pickup.ram --size 320
//   node scripts/harness/render-sheet.mjs --category malware --views        (adds side + top debug views)
//   node scripts/harness/render-sheet.mjs --all --bg paper --out /tmp/sheet.png --seed 7
//
// Each cell: a large render, plus (bottom-left) the same model at in-game scale (58 px per world unit,
// i.e. the hero is ~92 px tall). If the small one is unreadable, the model is too fussy.
// The cell order is printed to stdout, left to right, top to bottom.
import { resolve } from 'node:path';
import { withProcgen, parseArgs, projectRoot } from './lib/load.mjs';
import { writePng } from './lib/png.mjs';

const args = parseArgs(process.argv.slice(2), ['--category', '--size', '--out', '--bg', '--seed', '--cols']);
const size = Number(args.val('--size', 224));
const seed = Number(args.val('--seed', 1));
const GAME_PPU = 58;
const BACKGROUNDS = { dark: 0x211a36, paper: 0xf4f1ea, crypt: 0x1c252c, furnace: 0x2e1720 };
const bg = BACKGROUNDS[args.val('--bg', 'dark')] ?? BACKGROUNDS.dark;
const out = resolve(projectRoot, args.val('--out', 'scripts/harness/out/models.png'));

await withProcgen(async (p) => {
  let ids = args.rest;
  if (args.flag('--all')) ids = p.ModelCatalog.list().map((e) => e.id);
  else if (args.val('--category')) ids = p.ModelCatalog.list(args.val('--category')).map((e) => e.id);
  if (!ids.length) {
    console.error('usage: render-sheet.mjs <model id>... | --category <hero|malware|boss|pickup|door|prop|room|fx> | --all');
    console.error('       [--views] [--size 224] [--bg dark|paper|crypt|furnace] [--seed 1] [--cols n] [--out file.png]');
    console.error(`registered: ${p.ModelCatalog.list().map((e) => e.id).join(', ') || '(none)'}`);
    process.exit(2);
  }
  const views = args.flag('--views') ? ['front', 'side', 'top'] : ['front'];
  const gutter = 14, border = 5;
  const cellW = size + border * 2, cellH = size + border * 2;
  const cols = args.flag('--views') ? views.length : Number(args.val('--cols', Math.min(ids.length, Math.ceil(Math.sqrt(ids.length * 1.6)))));
  const cells = [];
  for (const id of ids) {
    const spec = p.ModelCatalog.build(id, seed);
    const baked = p.bakeModel(spec);
    for (const view of views) cells.push({ id, view, spec, baked });
  }
  const rows = Math.ceil(cells.length / cols);
  const sheet = p.makePixels(gutter + cols * (cellW + gutter), gutter + rows * (cellH + gutter), 0xf4f1ea);

  cells.forEach((cell, i) => {
    const x = gutter + (i % cols) * (cellW + gutter);
    const y = gutter + Math.floor(i / cols) * (cellH + gutter);
    p.fillRect(sheet, x, y, cellW, cellH, 0x110e1b);
    p.fillRect(sheet, x + border, y + border, size, size, bg);
    const big = p.rasterizeModel(cell.spec, { view: cell.view, size: size - 8, marginPx: 6, background: null, seed }, cell.baked);
    p.blit(sheet, big.image, x + border + Math.floor((size - big.image.width) / 2), y + border + Math.floor((size - big.image.height) / 2));
    if (cell.view === 'front') {
      const small = p.rasterizeModel(cell.spec, { pxPerUnit: GAME_PPU, marginPx: 2, background: null, seed }, cell.baked);
      if (small.image.width < size * 0.45 && small.image.height < size * 0.6) {
        p.fillRect(sheet, x + border, y + border + size - small.image.height - 4, small.image.width + 4, small.image.height + 4, bg);
        p.blit(sheet, small.image, x + border + 2, y + border + size - small.image.height - 2);
      }
    }
    const b = p.modelBounds(cell.baked);
    console.log(
      `[row ${Math.floor(i / cols) + 1}, col ${(i % cols) + 1}] ${cell.id} (${cell.view})  ` +
        `${cell.spec.parts.length} parts, ${b.triCount} tris, w ${b.size[0].toFixed(2)} h ${b.size[1].toFixed(2)} d ${b.size[2].toFixed(2)}, minY ${b.min[1].toFixed(3)}`,
    );
  });
  console.log(`\nwrote ${writePng(out, sheet)}  (${sheet.width}x${sheet.height})`);
});
