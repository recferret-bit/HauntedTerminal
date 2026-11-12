#!/usr/bin/env node
// Texture validator and contact sheet for Haunted Terminal's procedural comic textures.
// Run from the project root:
//
//   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all
//   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs tex.pcb-traces tex.ice --sheet
//   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all --sheet --out /tmp/t.png --seed 7
//   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --file path/to/draft.ts --sheet
//
//   --all          every texture in TextureCatalog
//   --usage u      only surface | backdrop | decal
//   --file f.ts    also load a module (path from the project root) and check every TextureEntry it exports,
//                  registered or not: the way to try a draft before it goes into src/procgen/textures
//   --seed n       build with this seed (default 1)
//   --strict       warnings fail too
//   --json         print the reports as JSON instead of text
//   --list         print id, size, zones and purpose of each picked texture as a Markdown table
//                  (the source of references/texture-catalog.md) and exit
//   --sheet        write a contact sheet PNG (default scripts/harness/out/textures.png, or --out file).
//                  Tileable textures are shown 2x2 (backdrops 2x1) so a seam shows up as a line through
//                  the middle of the cell; decals sit on the floor-1 wall colour. Cell order goes to stdout.
//
// Exit code 1 if any texture has an error (or a warning with --strict), 2 on usage errors.
import { relative, resolve } from 'node:path';
import { withProcgen, parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';
import { writePng } from '../../../../scripts/harness/lib/png.mjs';

const args = parseArgs(process.argv.slice(2), ['--seed', '--out', '--file', '--usage']);
const seed = Number(args.val('--seed', 1));
const json = args.flag('--json');
const log = (...a) => { if (!json) console.log(...a); };

await withProcgen(async (p, vite) => {
  const entries = [];
  const file = args.val('--file');
  if (file) {
    const mod = await vite.ssrLoadModule('/' + relative(projectRoot, resolve(projectRoot, file)));
    const isEntry = (v) => v && typeof v === 'object' && typeof v.id === 'string' && typeof v.build === 'function' && typeof v.usage === 'string';
    for (const v of Object.values(mod)) {
      if (isEntry(v)) entries.push(v);
      else if (Array.isArray(v)) entries.push(...v.filter(isEntry));
    }
    if (!entries.length) {
      console.error(`${file} exports no TextureEntry (an object with id, usage, tileable, build)`);
      process.exit(2);
    }
  }
  const seen = new Set(entries.map((e) => e.id));
  const add = (e) => { if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); } };
  if (args.flag('--all')) p.TextureCatalog.list().forEach(add);
  for (const id of args.rest) {
    if (seen.has(id)) continue;
    if (!p.TextureCatalog.has(id)) {
      console.error(`unknown texture "${id}". registered: ${p.TextureCatalog.list().map((e) => e.id).join(', ')}`);
      process.exit(2);
    }
    add(p.TextureCatalog.get(id));
  }
  const usage = args.val('--usage');
  const picked = usage ? entries.filter((e) => e.usage === usage) : entries;
  if (!picked.length) {
    console.error('usage: validate-textures.mjs <texture id>... | --all | --file draft.ts  [--usage surface|backdrop|decal]');
    console.error('       [--seed 1] [--strict] [--json] [--list] [--sheet [--out file.png]]');
    console.error(`registered: ${p.TextureCatalog.list().map((e) => e.id).join(', ') || '(none)'}`);
    process.exit(2);
  }

  if (args.flag('--list')) {
    console.log('| id | size | usage | zones | what it is, where it goes |\n|---|---|---|---|---|');
    for (const e of picked) {
      const b = e.build(seed);
      const zones = (e.zones ?? []).map((z) => `\`${z}\``).join(' ') || 'ink and paper only';
      const usage = `${e.usage}${e.tileable ? (e.usage === 'backdrop' ? ', tiles x' : ', tiles') : ''}`;
      console.log(`| \`${e.id}\` | ${b.width}x${b.height} | ${usage} | ${zones}${e.floor ? ` + floor ${e.floor} bg / accent` : ''} | ${e.purpose ?? e.label} |`);
    }
    return;
  }

  const built = picked.map((entry) => {
    const buf = entry.build(seed);
    return { entry, buf, report: p.validateTexture(entry, buf, { seed }) };
  });
  for (const b of built) log(p.formatTextureReport(b.report));
  const errors = built.reduce((n, b) => n + b.report.errors, 0);
  const warnings = built.reduce((n, b) => n + b.report.warnings, 0);
  log(`\n${built.length} textures, ${errors} errors, ${warnings} warnings (seed ${seed})`);

  let sheetPath = null;
  if (args.flag('--sheet')) {
    const gutter = 14, border = 5, maxWidth = 1460;
    const cells = built.map(({ entry, buf }) => {
      let img;
      if (entry.usage === 'decal') {
        const k = Math.max(1, Math.floor(192 / Math.max(buf.width, buf.height)));
        const up = p.texScaleUp(buf, k);
        img = p.makePixels(up.width + 24, up.height + 24, 0x211a36);
        p.blit(img, up, 12, 12);
      } else {
        const tiled = entry.tileable ? p.texTile(buf, 2, entry.usage === 'backdrop' ? 1 : 2) : buf;
        img = tiled.height < 256 && entry.usage !== 'backdrop' ? p.texScaleUp(tiled, Math.floor(256 / tiled.height)) : tiled;
      }
      return { entry, img };
    });
    // Flow layout: left to right, wrap at maxWidth.
    let x = gutter, y = gutter, rowH = 0, row = 1, col = 0, width = 0;
    for (const c of cells) {
      const cw = c.img.width + border * 2, ch = c.img.height + border * 2;
      if (x + cw + gutter > maxWidth && col > 0) { x = gutter; y += rowH + gutter; rowH = 0; row++; col = 0; }
      Object.assign(c, { x, y, row, col: ++col });
      x += cw + gutter;
      rowH = Math.max(rowH, ch);
      width = Math.max(width, x);
    }
    const sheet = p.makePixels(width, y + rowH + gutter, 0xf4f1ea);
    log('');
    for (const c of cells) {
      p.fillRect(sheet, c.x, c.y, c.img.width + border * 2, c.img.height + border * 2, 0x110e1b);
      p.blit(sheet, c.img, c.x + border, c.y + border);
      const shown = c.entry.usage === 'decal' ? 'on wall colour' : c.entry.tileable ? (c.entry.usage === 'backdrop' ? 'tiled 2x1' : 'tiled 2x2') : 'single';
      log(`[row ${c.row}, col ${c.col}] ${c.entry.id}  (${shown}, cell ${c.img.width}x${c.img.height})`);
    }
    sheetPath = writePng(resolve(projectRoot, args.val('--out', 'scripts/harness/out/textures.png')), sheet);
    log(`\nwrote ${sheetPath}  (${sheet.width}x${sheet.height})`);
  }

  if (json) console.log(JSON.stringify({ seed, errors, warnings, sheet: sheetPath, reports: built.map((b) => b.report) }, null, 2));
  process.exitCode = errors > 0 || (args.flag('--strict') && warnings > 0) ? 1 : 0;
});
