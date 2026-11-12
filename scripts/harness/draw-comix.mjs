#!/usr/bin/env node
// Software Comix Story Drawer (no GPU, no browser required).
// Reads chapters/<chapter-id>/story/comix.spec.json (or --spec <file>), rasterizes 3D rooms & actors
// from ModelCatalog, lays out Comix Zone panels, #ffd166 narration captions, speech bubbles, and SFX,
// and writes page-01.png .. page-NN.png + contact-sheet.png.
//
// Usage:
//   node scripts/harness/draw-comix.mjs --chapter chapter-01-freelance-storefront
//   node scripts/harness/draw-comix.mjs --spec chapters/chapter-01-freelance-storefront/story/comix.spec.json --out-dir /tmp/comix --no-public
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, projectRoot, withProcgen } from './lib/load.mjs';
import { writePng } from './lib/png.mjs';

const args = parseArgs(process.argv.slice(2), ['--chapter', '--spec', '--out-dir', '--width', '--height', '--seed']);
const chapterId = args.val('--chapter', 'chapter-01-freelance-storefront');
const specPath = resolve(
  projectRoot,
  args.val('--spec', `chapters/${chapterId}/story/comix.spec.json`),
);
const outDir = resolve(
  projectRoot,
  args.val('--out-dir', `chapters/${chapterId}/story/out`),
);
const pageW = Number(args.val('--width', 900));
const pageH = Number(args.val('--height', 1240));
const seed = Number(args.val('--seed', 7));
const syncPublic = !args.flag('--no-public');

if (!existsSync(specPath)) {
  console.error(`comix spec not found: ${specPath}`);
  process.exit(2);
}

const comix = JSON.parse(readFileSync(specPath, 'utf8'));

function parseHexColor(str, fallback = 0x211a36) {
  if (typeof str !== 'string') return fallback;
  const clean = str.trim().replace(/^#/, '');
  const n = Number.parseInt(clean, 16);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize punctuation not in the 3x5 bitmap font so captions/bubbles read cleanly without gaps. */
function cleanTextForBitmap(raw) {
  return String(raw ?? '')
    .replace(/—|–/g, ' - ')
    .replace(/['’`]/g, '')
    .replace(/"/g, '')
    .replace(/\$/g, 'USD ')
    .replace(/,/g, '')
    .replace(/;/g, ':')
    .replace(/&/g, '+')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function wrapText(text, maxChars) {
  const words = cleanTextForBitmap(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (cur.length + 1 + w.length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  return lines;
}

function dimBuffer(buf, factor = 0.52) {
  const out = { width: buf.width, height: buf.height, data: new Uint8ClampedArray(buf.data.length) };
  for (let i = 0; i < buf.data.length; i += 4) {
    out.data[i] = Math.round(buf.data[i] * factor);
    out.data[i + 1] = Math.round(buf.data[i + 1] * factor);
    out.data[i + 2] = Math.round(buf.data[i + 2] * factor);
    out.data[i + 3] = buf.data[i + 3];
  }
  return out;
}

function blitClippedToRect(p, dst, src, dx, dy, clipX, clipY, clipW, clipH) {
  const x0 = Math.max(clipX, dx);
  const y0 = Math.max(clipY, dy);
  const x1 = Math.min(clipX + clipW, dx + src.width);
  const y1 = Math.min(clipY + clipH, dy + src.height);
  if (x1 <= x0 || y1 <= y0) return;

  for (let y = y0; y < y1; y++) {
    const sy = y - dy;
    for (let x = x0; x < x1; x++) {
      const sx = x - dx;
      const si = (sy * src.width + sx) * 4;
      const alpha = src.data[si + 3] / 255;
      if (alpha <= 0) continue;
      const di = (y * dst.width + x) * 4;
      dst.data[di] = dst.data[di] * (1 - alpha) + src.data[si] * alpha;
      dst.data[di + 1] = dst.data[di + 1] * (1 - alpha) + src.data[si + 1] * alpha;
      dst.data[di + 2] = dst.data[di + 2] * (1 - alpha) + src.data[si + 2] * alpha;
      dst.data[di + 3] = 255;
    }
  }
}

function drawFramedBox(p, buf, x, y, w, h, fillHex, borderHex = 0x110e1b, borderPx = 3, shadowPx = 4) {
  if (shadowPx > 0) {
    p.fillRect(buf, x + shadowPx, y + shadowPx, w, h, 0x110e1b, 220);
  }
  p.fillRect(buf, x, y, w, h, borderHex);
  p.fillRect(buf, x + borderPx, y + borderPx, Math.max(1, w - borderPx * 2), Math.max(1, h - borderPx * 2), fillHex);
}

await withProcgen(async (p, vite) => {
  const font = await vite.ssrLoadModule('/src/procgen/textures/font.ts');
  const modelCache = new Map();

  function categoryScaleFor(modelId) {
    if (modelId.startsWith('pickup.')) return 0.44;
    if (modelId === 'prop.greybeard_rig') return 0.94;
    if (modelId === 'prop.kiro_ghost') return 0.56;
    if (modelId === 'prop.crt') return 0.64;
    if (modelId === 'prop.tar') return 0.56;
    if (modelId.startsWith('prop.')) return 0.50;
    if (modelId === 'door.socket') return 0.70;
    if (modelId.startsWith('door.')) return 0.86;
    if (modelId.startsWith('malware.agent_')) return 0.90;
    if (modelId.startsWith('malware.')) return 0.76;
    if (modelId === 'hero.hand') return 0.72;
    if (modelId.startsWith('boss.')) return 1.12;
    return 0.96;
  }

  function getBaked(modelId) {
    if (!modelCache.has(modelId)) {
      const spec = p.ModelCatalog.build(modelId, seed);
      const baked = p.bakeModel(spec);
      modelCache.set(modelId, { spec, baked });
    }
    return modelCache.get(modelId);
  }

  const renderedPages = [];
  const INK = 0x110e1b;
  const PAPER = 0xefe6d2;
  const HALFTONE = 0xe1d5bc;
  const CAPTION_BG = 0xffd166;
  const BUBBLE_BG = 0xfffdf7;
  const SHOUT_BG = 0xffe3e0;

  for (const page of comix.pages) {
    const canvas = p.makePixels(pageW, pageH, PAPER);

    // 1. Ben-Day halftone paper pattern across gutters
    for (let y = 6; y < pageH - 6; y += 8) {
      const offset = ((y / 8) & 1) * 4;
      for (let x = 6 + offset; x < pageW - 6; x += 8) {
        p.fillRect(canvas, x, y, 2, 2, HALFTONE);
      }
    }

    // 2. Page outer comic frameline & top issue masthead
    p.fillRect(canvas, 14, 12, pageW - 28, 34, INK);
    p.fillRect(canvas, 17, 15, pageW - 34, 28, 0x1d162f);
    const headerLeft = `${comix.title} // ${page.title}`;
    const headerRight = `P.${page.pageNumber}/${comix.pages.length}`;
    font.texText(canvas, cleanTextForBitmap(headerLeft), 28, 24, CAPTION_BG, 2);
    const rw = font.texTextWidth(headerRight, 2);
    font.texText(canvas, headerRight, pageW - 28 - rw, 24, 0x06d6a0, 2);

    const areaX = 20;
    const areaY = 54;
    const areaW = pageW - 40;
    const areaH = pageH - 72;

    // 3. Render each panel in reading order
    for (const panel of page.panels) {
      const [rx, ry, rWidth, rHeight] = panel.rect;
      const px = Math.round(areaX + rx * areaW);
      const py = Math.round(areaY + ry * areaH);
      const pw = Math.max(80, Math.round(rWidth * areaW));
      const ph = Math.max(80, Math.round(rHeight * areaH));
      const border = 5;
      const bgHex = parseHexColor(panel.bgHex, 0x211a36);

      // Panel drop shadow + 5px ink frame + interior fill
      drawFramedBox(p, canvas, px, py, pw, ph, bgHex, INK, border, 6);

      const ix = px + border;
      const iy = py + border;
      const iw = pw - border * 2;
      const ih = ph - border * 2;

      // Subtle atmospheric halftone band at top of panel
      for (let hy = iy + 4; hy < iy + Math.min(64, Math.floor(ih * 0.28)); hy += 6) {
        const shift = ((hy / 6) & 1) * 3;
        for (let hx = ix + 4 + shift; hx < ix + iw - 4; hx += 6) {
          p.fillRect(canvas, hx, hy, 2, 2, 0xffffff, 22);
        }
      }

      // Grounded stage floor strip inside panel
      const feetY = iy + Math.round(ih * 0.86);
      p.fillRect(canvas, ix, feetY, iw, iy + ih - feetY, 0x130f20, 195);
      p.fillRect(canvas, ix, feetY - 2, iw, 3, INK);

      // Optional 3D room set backdrop
      if (panel.room) {
        const { spec, baked } = getBaked(panel.room);
        const roomSize = Math.min(Math.max(160, Math.round(Math.min(iw, ih) * 0.96)), 520);
        const roomRender = p.rasterizeModel(
          spec,
          { view: 'front', size: roomSize, marginPx: 4, background: null, seed },
          baked,
        );
        const dimmedRoom = dimBuffer(roomRender.image, 0.58);
        const rdx = ix + Math.round((iw - dimmedRoom.width) / 2);
        const rdy = feetY - dimmedRoom.height + Math.round(ih * 0.08);
        blitClippedToRect(p, canvas, dimmedRoom, rdx, rdy, ix, iy, iw, ih);
      }

      // Foreground 3D Cast (grounded on feetY, scaled by category silhouette hierarchy)
      for (const actor of panel.cast ?? []) {
        const { spec, baked } = getBaked(actor.model);
        const catMult = categoryScaleFor(actor.model);
        const baseActorPx = Math.round(Math.min(ih * 0.66, iw * 0.50) * catMult * (actor.scale ?? 1.0));
        const clampedPx = Math.max(38, Math.min(360, baseActorPx));
        const rendered = p.rasterizeModel(
          spec,
          { view: actor.view ?? 'front', size: clampedPx, marginPx: 4, background: null, seed },
          baked,
        );
        const centerX = ix + Math.round(iw * (0.5 + (actor.x ?? 0) * 0.36));
        const adx = centerX - Math.round(rendered.image.width / 2);
        const ady = feetY - rendered.image.height + 6;
        blitClippedToRect(p, canvas, rendered.image, adx, ady, ix, iy, iw, ih);
      }

      // Yellow #ffd166 narration caption box (top-left of panel)
      if (panel.caption) {
        const capScale = 2;
        const maxChars = Math.max(18, Math.floor((iw - 36) / ((3 + 1) * capScale)));
        const lines = wrapText(panel.caption, maxChars).slice(0, 3);
        const longest = Math.max(...lines.map((l) => font.texTextWidth(l, capScale)), 40);
        const boxW = Math.min(iw - 16, longest + 20);
        const boxH = lines.length * 14 + 12;
        const cx = ix + 8;
        const cy = iy + 8;
        drawFramedBox(p, canvas, cx, cy, boxW, boxH, CAPTION_BG, INK, 3, 3);
        lines.forEach((line, idx) => {
          font.texText(canvas, line, cx + 10, cy + 8 + idx * 14, INK, capScale);
        });
      }

      // Speech bubbles
      for (const b of panel.bubbles ?? []) {
        const bScale = 2;
        const maxBubbleChars = Math.max(16, Math.min(34, Math.floor((iw * 0.68) / ((3 + 1) * bScale))));
        const speakerLabel = cleanTextForBitmap(b.speaker || 'VOICE');
        const lines = wrapText(b.text, maxBubbleChars).slice(0, 4);
        const contentW = Math.max(
          font.texTextWidth(speakerLabel, 2) + 18,
          ...lines.map((l) => font.texTextWidth(l, bScale)),
        );
        const bw = Math.min(iw - 16, contentW + 24);
        const bh = lines.length * 14 + 32;
        const bx = Math.max(ix + 8, Math.min(ix + iw - bw - 8, Math.round(ix + (b.x ?? 0.5) * iw - bw / 2)));
        const by = Math.max(iy + 46, Math.min(iy + ih - bh - 14, Math.round(iy + (b.y ?? 0.3) * ih)));

        const isShout = b.style === 'shout';
        const borderColor = isShout ? 0xef476f : INK;
        const fillColor = isShout ? SHOUT_BG : BUBBLE_BG;
        drawFramedBox(p, canvas, bx, by, bw, bh, fillColor, borderColor, 3, 3);

        // Speaker pill (scale=2 crisp bitmap badge)
        const pillW = Math.min(bw - 16, font.texTextWidth(speakerLabel, 2) + 14);
        p.fillRect(canvas, bx + 8, by + 5, pillW, 15, INK);
        font.texText(canvas, speakerLabel, bx + 15, by + 8, isShout ? 0xff6b8b : CAPTION_BG, 2);

        // Bubble text lines
        lines.forEach((line, idx) => {
          font.texText(canvas, line, bx + 11, by + 25 + idx * 14, INK, bScale);
        });

        // Comic pointer tail below bubble
        const tailX = bx + Math.round(bw * 0.45);
        p.fillRect(canvas, tailX, by + bh, 8, 6, borderColor);
        p.fillRect(canvas, tailX + 2, by + bh - 2, 4, 5, fillColor);
      }

      // Onomatopoeia SFX lettering
      if (panel.sfx?.text) {
        const sfxText = cleanTextForBitmap(panel.sfx.text);
        const sfxScale = 4;
        const sw = font.texTextWidth(sfxText, sfxScale);
        const sx = Math.max(ix + 8, Math.min(ix + iw - sw - 8, Math.round(ix + (panel.sfx.x ?? 0.5) * iw - sw / 2)));
        const sy = Math.max(iy + 12, Math.min(iy + ih - 28, Math.round(iy + (panel.sfx.y ?? 0.8) * ih)));
        const sfxHex = parseHexColor(panel.sfx.color, CAPTION_BG);
        // Thick comic ink outline around SFX
        for (const [ox, oy] of [
          [-3, 0],
          [3, 0],
          [0, -3],
          [0, 3],
          [3, 3],
          [-2, -2],
        ]) {
          font.texText(canvas, sfxText, sx + ox, sy + oy, INK, sfxScale);
        }
        font.texText(canvas, sfxText, sx, sy, sfxHex, sfxScale);
      }
    }

    const filename = `page-${String(page.pageNumber).padStart(2, '0')}.png`;
    const writtenPath = writePng(resolve(outDir, filename), canvas);
    if (syncPublic) {
      const pubDir = resolve(projectRoot, 'public/comix', comix.chapterId);
      mkdirSync(pubDir, { recursive: true });
      copyFileSync(writtenPath, resolve(pubDir, filename));
    }
    renderedPages.push({ pageNumber: page.pageNumber, filename, writtenPath, canvas });
    console.log(`drew ${writtenPath} (${canvas.width}x${canvas.height}, ${page.panels.length} panels)`);
  }

  // 4. Build 2-column half-scale contact sheet of the entire issue
  const thumbScale = 0.5;
  const tw = Math.round(pageW * thumbScale);
  const th = Math.round(pageH * thumbScale);
  const cols = Math.min(2, renderedPages.length);
  const rows = Math.ceil(renderedPages.length / cols);
  const pad = 16;
  const sheet = p.makePixels(pad + cols * (tw + pad), pad + rows * (th + pad), 0x161224);

  renderedPages.forEach((entry, idx) => {
    const ox = pad + (idx % cols) * (tw + pad);
    const oy = pad + Math.floor(idx / cols) * (th + pad);
    for (let y = 0; y < th; y++) {
      const sy = Math.min(entry.canvas.height - 1, Math.floor(y / thumbScale));
      for (let x = 0; x < tw; x++) {
        const sx = Math.min(entry.canvas.width - 1, Math.floor(x / thumbScale));
        const si = (sy * entry.canvas.width + sx) * 4;
        const di = ((oy + y) * sheet.width + (ox + x)) * 4;
        sheet.data[di] = entry.canvas.data[si];
        sheet.data[di + 1] = entry.canvas.data[si + 1];
        sheet.data[di + 2] = entry.canvas.data[si + 2];
        sheet.data[di + 3] = 255;
      }
    }
  });

  const sheetPath = writePng(resolve(outDir, 'contact-sheet.png'), sheet);
  if (syncPublic) {
    const pubDir = resolve(projectRoot, 'public/comix', comix.chapterId);
    mkdirSync(pubDir, { recursive: true });
    copyFileSync(sheetPath, resolve(pubDir, 'contact-sheet.png'));
  }
  console.log(`wrote contact sheet ${sheetPath} (${sheet.width}x${sheet.height})`);
});
