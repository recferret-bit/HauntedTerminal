#!/usr/bin/env node
// Checks public/assets/manifest.json and the PNG sprites it points at, against what the game really does with them.
//
//   node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs            check everything
//   node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs --strict   warnings fail too
//   node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs --root <dir>   another project root (used by the self-test)
//
// Errors (exit 1): broken JSON, a malformed entry, a file that is not a PNG, a PNG the loader cannot use.
// Warnings: a key no procedural mesh uses, off-palette or mostly transparent art, odd sizes, orphan files.
// A missing PNG is NOT an error: the game falls back to the procedural mesh's own colours.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodePng, isPng, readPngHeader } from './lib/png-read.mjs';
import { CEL_BANDS, colorDistance, loadZones, projectRoot } from './lib/palette.mjs';

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const rootArg = argv.indexOf('--root');
const root = rootArg >= 0 ? resolve(argv[rootArg + 1]) : projectRoot;

const errors = [];
const warnings = [];
const notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const MAX_SIDE = 1024; // an albedo map on a mesh shown ~100 px tall; anything bigger is wasted
const MIN_SIDE = 32;
const SPRITE_DIR = 'public/assets/sprites';

// Keys that actually receive a texture: ComicStage.buildScene() binds registry.getTexture(mesh.userData.assetKey),
// and procedural-cast.ts sets assetKey to the group name given to begin('<key>').
function castKeys() {
  const file = resolve(root, 'src/renderer/procedural-cast.ts');
  if (!existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');
  const keys = new Set([...src.matchAll(/begin\('([\w-]+)'\)/g)].map((m) => m[1]));
  for (const m of src.matchAll(/userData\.assetKey = '([\w-]+)'/g)) keys.add(m[1]);
  return keys;
}

function paletteShare(png, zones) {
  // Share of opaque pixels within tolerance of some zone colour in any cel band, or of ink / paper.
  const targets = [];
  for (const z of zones) for (const band of CEL_BANDS) targets.push([z.rgb[0] * band, z.rgb[1] * band, z.rgb[2] * band]);
  const step = Math.max(1, Math.floor(Math.sqrt((png.width * png.height) / 20000)));
  let opaque = 0, onPalette = 0, total = 0;
  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const o = (y * png.width + x) * 4;
      total++;
      if (png.data[o + 3] < 128) continue;
      opaque++;
      const c = [png.data[o], png.data[o + 1], png.data[o + 2]];
      if (targets.some((t) => colorDistance(c, t) < 60)) onPalette++;
    }
  }
  return { opaqueShare: total ? opaque / total : 0, paletteShare: opaque ? onPalette / opaque : 1 };
}

const manifestPath = resolve(root, 'public/assets/manifest.json');
let manifest = null;
if (!existsSync(manifestPath)) err(`manifest not found: ${manifestPath}`);
else {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    err(`manifest.json is not valid JSON: ${e.message}`);
  }
}

if (manifest && (typeof manifest !== 'object' || Array.isArray(manifest))) {
  err('manifest.json must be an object of { key: entry }');
  manifest = null;
}

const rows = [];
if (manifest) {
  const zones = loadZones(existsSync(resolve(root, 'src/procgen/core/palette.ts')) ? root : projectRoot);
  const keys = castKeys();
  const referenced = new Set();

  for (const [key, entry] of Object.entries(manifest)) {
    const at = `"${key}"`;
    if (!/^[a-z][a-z0-9_]*$/.test(key)) err(`${at}: keys are lower_snake_case`);
    if (!entry || typeof entry !== 'object') { err(`${at}: entry must be an object`); continue; }
    const { textureUrl, anchor, targetHeight, tintFallback } = entry;
    for (const extra of Object.keys(entry)) {
      if (!['textureUrl', 'anchor', 'targetHeight', 'tintFallback'].includes(extra)) warn(`${at}: unknown field "${extra}" (AssetRegistry ignores it)`);
    }
    if (!Array.isArray(anchor) || anchor.length !== 2 || anchor.some((v) => typeof v !== 'number' || v < 0 || v > 1)) err(`${at}: anchor must be [x, y] with both in 0..1`);
    if (typeof targetHeight !== 'number' || !(targetHeight >= 16 && targetHeight <= 400)) err(`${at}: targetHeight must be a number of pixels in 16..400`);
    if (typeof tintFallback !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(tintFallback)) err(`${at}: tintFallback must be "#rrggbb"`);
    else if (!zones.some((z) => colorDistance(z.rgb, [1, 3, 5].map((i) => parseInt(tintFallback.slice(i, i + 2), 16))) < 40)) {
      notes.push(`${at}: tintFallback ${tintFallback} is not a palette colour (harmless today: nothing reads tintFallback)`);
    }
    if (keys && !keys.has(key)) warn(`${at}: no mesh in src/renderer/procedural-cast.ts has this key, so its PNG would never be shown`);

    let status = 'procedural (no PNG)';
    if (typeof textureUrl !== 'string' || !/^\/assets\/sprites\/[\w.-]+\.png$/.test(textureUrl)) {
      err(`${at}: textureUrl must look like "/assets/sprites/<name>.png"`);
    } else {
      referenced.add(textureUrl.split('/').pop());
      if (textureUrl !== `/assets/sprites/${key}.png`) warn(`${at}: textureUrl is not /assets/sprites/${key}.png (allowed, but the convention is key = file name)`);
      const file = resolve(root, 'public', `.${textureUrl}`);
      if (existsSync(file)) {
        const buf = readFileSync(file);
        if (!isPng(buf)) err(`${at}: ${textureUrl} is not a PNG file`);
        else {
          try {
            const head = readPngHeader(buf);
            status = `PNG ${head.width}x${head.height}`;
            if (head.width > MAX_SIDE || head.height > MAX_SIDE) warn(`${at}: ${head.width}x${head.height} is larger than ${MAX_SIDE} px; the mesh is drawn about ${targetHeight} px tall`);
            if (head.width < MIN_SIDE || head.height < MIN_SIDE) warn(`${at}: ${head.width}x${head.height} is smaller than ${MIN_SIDE} px`);
            const png = decodePng(buf);
            const share = paletteShare(png, zones);
            status += `, ${(share.opaqueShare * 100).toFixed(0)}% opaque, ${(share.paletteShare * 100).toFixed(0)}% on palette`;
            if (share.opaqueShare < 0.6) warn(`${at}: ${(100 - share.opaqueShare * 100).toFixed(0)}% of the PNG is transparent. It is used as an albedo map (alpha is ignored), so transparent areas show as their RGB, usually black. Paint edge to edge.`);
            if (share.paletteShare < 0.6) warn(`${at}: only ${(share.paletteShare * 100).toFixed(0)}% of its pixels are near a palette colour; it will look pasted in`);
          } catch (e) {
            err(`${at}: ${textureUrl}: ${e.message}`);
          }
        }
      }
    }
    rows.push([key, status]);
  }

  if (keys) for (const k of keys) if (!(k in manifest)) notes.push(`cast mesh "${k}" has no manifest entry (it can never take a PNG)`);
  const dir = resolve(root, SPRITE_DIR);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('.')) continue;
      if (!f.toLowerCase().endsWith('.png')) warn(`${join(SPRITE_DIR, f)}: only .png files are loaded`);
      else if (!referenced.has(f)) warn(`${join(SPRITE_DIR, f)}: not referenced by manifest.json, so it is never loaded`);
    }
  } else notes.push(`${SPRITE_DIR}/ does not exist yet (every key is procedural)`);
}

const pad = Math.max(0, ...rows.map((r) => r[0].length));
for (const [key, status] of rows) console.log(`  ${key.padEnd(pad)}  ${status}`);
for (const n of notes) console.log(`note: ${n}`);
for (const w of warnings) console.log(`warn: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log(`${failed ? 'FAIL' : 'PASS'} manifest: ${rows.length} keys, ${errors.length} errors, ${warnings.length} warnings`);
process.exitCode = failed ? 1 : 0;
