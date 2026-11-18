// Detectors of the visual audit (spec .kiro/specs/qa-visual-audit/, Req 13). PAGE_DETECTORS is installed in the page by the
// capture preamble as `window.__visualAudit`; the Node side reads its results and adds the pixel and font measures.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankStats, offPaletteShare, paletteFromText } from './visual-diff.mjs';

/** Page-side detector functions, as source. They only read the DOM, except `markText`, which tags elements for the font query. */
export const PAGE_DETECTORS = `window.__visualAudit = (() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(p + '#' + e.id); break; }
      const cls = [...e.classList].slice(0, 2).join('.');
      if (cls) p += '.' + cls;
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  const box = (r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const matches = (el, sels) => sels.some((s) => { try { return el.matches(s) || !!el.closest(s); } catch { return false; } });
  return {
    overflow(ignore = []) {
      const out = [];
      for (const el of [...document.body.querySelectorAll('*')].slice(0, 6000)) {
        if (!el.textContent || !el.textContent.trim() || matches(el, ignore) || !visible(el)) continue;
        const cs = getComputedStyle(el);
        const clips = /hidden|clip/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === 'ellipsis';
        if (!clips) continue;
        const x = el.scrollWidth - el.clientWidth, y = el.scrollHeight - el.clientHeight;
        if (x <= 1 && y <= 1) continue;
        const r = el.getBoundingClientRect();
        // The visible descendants that stick out of the box: what is actually cut.
        const culprits = [...el.querySelectorAll('*')].filter((c) => {
          const q = c.getBoundingClientRect();
          return visible(c) && (q.right > r.right + 1 || q.bottom > r.bottom + 1 || q.left < r.left - 1 || q.top < r.top - 1);
        }).slice(0, 3).map((c) => ({ selector: path(c), box: box(c.getBoundingClientRect()), text: (c.textContent || '').trim().slice(0, 40) }));
        // Only hidden children stick out (an invisible stamp past the stage edge): nothing the player sees is cut.
        if (!culprits.length && !ownText(el)) continue;
        out.push({ selector: path(el), box: box(r), overflowX: x, overflowY: y, text: el.textContent.trim().slice(0, 60), culprits });
      }
      return out;
    },
    boxes(selectors) {
      const out = [];
      for (const sel of selectors) {
        let list = [];
        try { list = [...document.querySelectorAll(sel)]; } catch { continue; }
        list.filter(visible).slice(0, 40).forEach((el, i) => { el.dataset.vaBox = sel + '#' + i; out.push({ selector: sel, index: i, path: path(el), box: box(el.getBoundingClientRect()) }); });
      }
      return out;
    },
    related(a, b) {
      const ea = document.querySelector('[data-va-box="' + a + '"]'), eb = document.querySelector('[data-va-box="' + b + '"]');
      return !!(ea && eb && (ea.contains(eb) || eb.contains(ea)));
    },
    page() {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight };
    },
    fonts() {
      // No await of document.fonts.ready: under paused virtual time it may never settle; the capture has already settled.
      return [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, status: f.status }));
    },
    markText(limit = 160) {
      let n = 0;
      for (const el of document.body.querySelectorAll('*')) {
        if (n >= limit) break;
        if (ownText(el) && visible(el)) el.setAttribute('data-va-font', String(n++));
      }
      return n;
    },
  };
})();`;

const intersect = (a, b) => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? [w, h] : null;
};
const pairKey = (a, b) => [a, b].sort().join(' | ');

/** Overlaps above 4 x 4 px between listed elements, skipping ancestor/descendant pairs and the allowOverlap selector pairs. */
export async function overlapFlags(evaluate, boxes, allowOverlap = []) {
  const allowed = new Set(allowOverlap.map(([a, b]) => pairKey(a, b)));
  const flags = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.selector === b.selector || allowed.has(pairKey(a.selector, b.selector))) continue;
      const hit = intersect(a.box, b.box);
      if (!hit || hit[0] <= 4 || hit[1] <= 4) continue;
      const ida = `${a.selector}#${a.index}`, idb = `${b.selector}#${b.index}`;
      if (await evaluate(`window.__visualAudit.related(${JSON.stringify(ida)}, ${JSON.stringify(idb)})`)) continue;
      flags.push({ kind: 'overlap', a: a.path, b: b.path, boxA: a.box, boxB: b.box, overlap: hit });
    }
  }
  return flags;
}

/** Listed elements reaching outside the viewport (horizontally only for a full-page capture), and page-level horizontal scroll. */
export function viewportFlags(boxes, page, { width, height, fullPage = false }) {
  const flags = [];
  for (const b of boxes) {
    const [x, y, w, h] = b.box;
    const outX = x < -1 || x + w > width + 1;
    const outY = !fullPage && (y < -1 || y + h > height + 1);
    if (outX || outY) flags.push({ kind: 'out-of-viewport', selector: b.path, box: b.box, viewport: [width, height] });
  }
  if (page.scrollWidth > page.clientWidth + 1) flags.push({ kind: 'horizontal-scroll', scrollWidth: page.scrollWidth, clientWidth: page.clientWidth });
  return flags;
}

/**
 * Font flags: a face that failed to load, and any text element whose rendered platform font is not an allowed family
 * (CDP CSS.getPlatformFontsForNode, so a silent fallback is caught). Returns { flags, used }.
 */
export async function fontFlags(browser, faces, { allowed, exceptions = [] }) {
  const flags = faces.filter((f) => f.status === 'error').map((f) => ({ kind: 'font-failed', family: f.family, weight: f.weight }));
  // Every DevTools call is bounded: under a paused clock a CSS or DOM call can wait forever.
  const send = (method, params) => timed(browser.send(method, params), 10000, method);
  const used = new Map();
  try {
    await send('DOM.enable');
    await send('CSS.enable');
    const { root } = await send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-va-font]' });
    for (const nodeId of nodeIds) {
      const { fonts } = await send('CSS.getPlatformFontsForNode', { nodeId }).catch(() => ({ fonts: [] }));
      for (const f of fonts) {
        if (!used.has(f.familyName)) used.set(f.familyName, { glyphs: 0, nodeId });
        used.get(f.familyName).glyphs += f.glyphCount;
      }
    }
  } catch (err) {
    flags.push({ kind: 'font-check-failed', error: err.message });
  }
  const ok = (name) => [...allowed, ...exceptions].some((a) => name.toLowerCase().includes(a.toLowerCase()));
  for (const [name, { glyphs, nodeId }] of used) {
    if (ok(name)) continue;
    const { outerHTML } = await send('DOM.getOuterHTML', { nodeId }).catch(() => ({ outerHTML: '' }));
    flags.push({ kind: 'font-fallback', family: name, glyphs, example: outerHTML.slice(0, 120) });
  }
  return { flags, used: Object.fromEntries([...used].map(([k, v]) => [k, v.glyphs])) };
}

function timed(promise, ms, what) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} did not answer within ${ms} ms`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** The palette: colours of src/procgen/core/palette.ts plus every hex colour in src/styles/*.css, read at run time. */
export function loadPalette(root) {
  const styles = join(root, 'src/styles');
  const texts = [readFileSync(join(root, 'src/procgen/core/palette.ts'), 'utf8')];
  for (const f of readdirSync(styles).filter((n) => n.endsWith('.css'))) texts.push(readFileSync(join(styles, f), 'utf8'));
  return paletteFromText(texts);
}

/** Pixel detectors of one still capture: blank / black and the off-palette share against the screen's limit. */
export function pixelFlags(img, palette, maxOffPalette) {
  const stats = blankStats(img);
  const offPalette = offPaletteShare(img, palette);
  const flags = [];
  if (stats.blank) flags.push({ kind: stats.black ? 'black-frame' : 'blank-frame', ...stats });
  if (offPalette > maxOffPalette) flags.push({ kind: 'off-palette', share: offPalette, max: maxOffPalette });
  return { flags, measures: { ...stats, offPalette } };
}
