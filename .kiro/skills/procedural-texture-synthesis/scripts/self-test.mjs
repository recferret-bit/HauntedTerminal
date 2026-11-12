#!/usr/bin/env node
// Proves the texture validator catches what it claims. Each case is a synthetic texture with a known
// answer: bad ones must raise the named issue, good ones must raise no error at all.
//
//   node .kiro/skills/procedural-texture-synthesis/scripts/self-test.mjs
//
// Prints PASS / FAIL per case, exits 1 if any case fails. Run it after touching
// src/procgen/validate/textures.ts, TEXTURE_LIMITS, or the drawing toolkit.
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (p) => {
  const C = p.texColor;
  const INK = p.INK, PAPER = p.PAPER;
  const entry = (id, build, extra = {}) => ({ id, label: id, usage: 'surface', tileable: true, zones: ['pcb', 'pcbDark', 'gold'], purpose: 'self-test', build, ...extra });

  /** A sound texture: ink-edged gold pads on a PCB, moved around by the seed. */
  const good = (seed, w = 64, h = 64) => {
    const rng = p.makeRng(seed);
    const buf = p.texNew(w, h, C('pcb'));
    p.texStripes(buf, C('pcbDark'), { period: 16, width: 4, dir: 'h', offset: 4 * rng.int(0, 3) });
    for (let i = 0; i < 4; i++) {
      const x = 8 * rng.int(0, 7), y = 8 * rng.int(0, 7);
      p.texRect(buf, x - 1, y - 1, 8, 8, INK);
      p.texRect(buf, x, y, 6, 6, C('gold'));
    }
    return buf;
  };
  const each = (buf, fn) => {
    for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) {
      const i = (y * buf.width + x) * 4;
      const [r, g, b, a = 255] = fn(x, y, [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]]);
      buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = a;
    }
    return buf;
  };
  const rgb = (hex) => p.hexToRgb(hex);
  const blur = (src) => {
    const out = p.texNew(src.width, src.height, 0);
    return each(out, (x, y) => {
      const acc = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p.getPixel(src, x + dx, y + dy).slice(0, 3).forEach((v, k) => { acc[k] += v / 9; });
      return acc.map(Math.round);
    });
  };
  let calls = 0;

  // [name, entry, codes that must be raised (empty = must have no errors)]
  const cases = [
    ['good: pads on a PCB', entry('t.good', (s) => good(s)), []],
    ['good: quantizeToPalette repairs a tinted texture', entry('t.requantized', (s) => {
      const buf = each(good(s), (_x, _y, c) => [c[0] + 14, c[1], c[2] + 9]);
      p.quantizeToPalette(buf, ['pcb', 'pcbDark', 'gold']);
      return buf;
    }), []],
    ['good: dark backdrop', entry('t.backdrop', (s) => {
      const buf = p.texNew(256, 128, p.texFloorColor(2, 'bg'));
      p.texStripes(buf, p.texFloorColor(2, 'bg', 1), { period: 32, width: 8, dir: 'v', offset: 8 * (s % 4) });
      p.texRect(buf, 0, 8, 256, 16, p.texFloorColor(2, 'bg', 2));
      p.texRect(buf, 8 + 32 * (s % 4), 12, 4, 4, p.texFloorColor(2, 'accent', 2));
      return buf;
    }, { usage: 'backdrop', zones: [], floor: 2 }), []],
    ['good: decal with hard alpha', entry('t.decal', (s) => {
      const buf = p.texNewDecal(32, 32);
      p.texDisc(buf, 16, 16, 8 + (s % 3), C('gold'));
      p.texInkOutline(buf, 2);
      return buf;
    }, { usage: 'decal', tileable: false }), []],

    ['seam: diagonal stripes whose period does not divide the size', entry('t.seam-period', (s) => {
      const buf = p.texNew(64, 64, C('pcb'));
      p.texStripes(buf, C('pcbDark'), { period: 24, width: 12, dir: '/', offset: s });
      return buf;
    }), ['SEAM_X', 'SEAM_Y']],
    ['seam: blobs from a function that does not wrap', entry('t.seam-blobs', (s) => {
      return each(p.texNew(64, 64, 0), (x, y) => rgb(Math.sin(x * 0.13 + s) + Math.sin(y * 0.17) > 0 ? C('pcb') : C('pcbDark')));
    }), ['SEAM_X', 'SEAM_Y']],
    ['seam: a disc clipped at the top edge instead of wrapping', entry('t.seam-clip', (s) => {
      const buf = p.texNew(64, 64, C('pcb'));
      p.texDisc(buf, 24 + (s % 4) * 4, 0, 14, C('gold'), (_x, y) => y >= 0);
      return buf;
    }), ['SEAM_Y']],
    ['gradient: a smooth fade between two palette colours', entry('t.gradient', (s) => {
      const a = rgb(C('pcb')), b = rgb(C('pcbDark'));
      return each(p.texNew(64, 64, 0), (x, y) => {
        const t = Math.abs((((x + y * 0.5 + s) % 64) / 32) - 1);
        return a.map((v, k) => Math.round(v + (b[k] - v) * t));
      });
    }), ['GRADIENT']],
    ['gradient: a sound texture, blurred', entry('t.blur', (s) => blur(good(s))), ['OFF_PALETTE']],
    ['off-palette: a sound texture with a colour cast', entry('t.tinted', (s) => each(good(s), (_x, _y, c) => [c[0] + 14, c[1], c[2] + 9])), ['OFF_PALETTE']],
    ['off-palette: colours that are not in ZONES', entry('t.offpalette', (s) => {
      const buf = p.texNew(64, 64, 0x2255ff);
      p.texStripes(buf, 0x00ff00, { period: 16, width: 8, dir: 'v', offset: s % 8 });
      return buf;
    }), ['OFF_PALETTE']],
    ['off-palette: a real zone the entry did not declare', entry('t.undeclared', (s) => {
      const buf = good(s);
      p.texRect(buf, 16, 16, 16, 16, C('corruptMagenta'));
      return buf;
    }), ['OFF_PALETTE']],
    ['noise: random RGB per pixel', entry('t.noise', (s) => {
      const rng = p.makeRng(s);
      return each(p.texNew(64, 64, 0), () => [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)]);
    }), ['COLOR_COUNT', 'OFF_PALETTE', 'THIN_DETAIL']],
    ['flat fill: one colour', entry('t.flat', () => p.texNew(64, 64, C('pcb')), { staticLayout: true }), ['FLAT_FILL']],
    ['backdrop: too bright', entry('t.backdrop-bright', (s) => {
      const buf = p.texNew(256, 128, PAPER);
      p.texStripes(buf, C('plastic'), { period: 32, width: 8, dir: 'v', offset: s % 8 });
      return buf;
    }, { usage: 'backdrop', zones: ['plastic'], floor: 1 }), ['BACKDROP_BRIGHT']],
    ['backdrop: dark on average but full of bright accent', entry('t.backdrop-contrast', (s) => {
      const buf = p.texNew(256, 128, p.texFloorColor(1, 'bg', 2));
      p.texStripes(buf, p.texFloorColor(1, 'accent'), { period: 32, width: 4, dir: 'v', offset: s % 8 });
      return buf;
    }, { usage: 'backdrop', zones: [], floor: 1 }), ['BACKDROP_CONTRAST', 'BACKDROP_BRIGHT']],
    ['backdrop: motif and lights inside the actor band (dark and calm overall)', entry('t.backdrop-band', (s) => {
      // The old floor-4 layout: fins with ink gaps and ember lights in the lower half. Whole-wall luma
      // and spread stay inside the backdrop limits, so only the band check can catch it.
      const buf = p.texNew(256, 128, p.texFloorColor(4, 'bg'));
      for (let x = 4 * (s % 4); x < 256; x += 16) {
        p.texRect(buf, x, 70, 6, 42, p.texFloorColor(4, 'bg', 1));
        p.texRect(buf, x + 6, 70, 2, 42, INK);
      }
      for (let x = 4; x < 256; x += 32) p.texRect(buf, x, 118, 8, 2, p.texFloorColor(4, 'accent', 2));
      return buf;
    }, { usage: 'backdrop', zones: [], floor: 4 }), ['BACKDROP_BAND']],
    ['non-determinism: the build depends on a call counter', entry('t.nondeterministic', () => {
      const buf = good(1);
      p.texRect(buf, (calls++ * 8) % 64, 0, 8, 8, C('gold'));
      return buf;
    }), ['NONDETERMINISTIC']],
    ['non-determinism: Math.random()', entry('t.random', () => {
      const buf = good(1);
      p.texRect(buf, 8 * Math.floor(Math.random() * 8), 8 * Math.floor(Math.random() * 8), 8, 8, C('gold'));
      p.texRect(buf, 8 * Math.floor(Math.random() * 8), 8 * Math.floor(Math.random() * 8), 8, 8, C('pcbDark'));
      return buf;
    }), ['NONDETERMINISTIC']],
    ['seed ignored: every seed builds the same pixels', entry('t.seed-ignored', () => good(1)), ['SEED_IGNORED']],
    ['size: not a power of two', entry('t.size', (s) => good(s, 100, 64)), ['SIZE_POW2']],
    ['thin detail: 1 px pinstripes', entry('t.thin', (s) => {
      const buf = p.texNew(64, 64, C('pcb'));
      p.texStripes(buf, INK, { period: 2, width: 1, dir: 'v' });
      p.texRect(buf, 8 * (s % 8), 0, 8, 8, C('gold'));
      return buf;
    }), ['THIN_DETAIL', 'DOWNSAMPLE_LOSS']],
    ['alpha: a surface with holes', entry('t.holes', (s) => each(good(s), (x, y, c) => (x < 8 && y < 8 ? [0, 0, 0, 0] : c))), ['ALPHA_HOLES']],
    ['alpha: a decal with soft edges', entry('t.soft', (s) => {
      const buf = p.texNewDecal(32, 32);
      p.texDisc(buf, 16, 16, 8 + (s % 3), C('gold'));
      return each(buf, (x, y, c) => (c[3] === 0 && Math.hypot(x - 15.5, y - 15.5) < 13 ? [...rgb(C('gold')), 96] : c));
    }, { usage: 'decal', tileable: false }), ['ALPHA_SOFT']],
  ];

  let failed = 0;
  for (const [name, e, expect] of cases) {
    const report = p.validateTexture(e, e.build(1), { seed: 1 });
    const codes = report.issues.map((i) => i.code);
    const ok = expect.length ? expect.every((c) => codes.includes(c)) : report.errors === 0;
    if (!ok) failed++;
    const want = expect.length ? `expects ${expect.join(' + ')}` : 'expects no errors';
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${want}; got ${codes.length ? [...new Set(codes)].join(', ') : 'no issues'}`);
  }

  // Every shipped texture must be clean at several seeds, not just the default one.
  for (const e of p.TextureCatalog.list()) {
    const bad = [];
    for (const seed of [1, 2, 3, 7, 42]) {
      const report = p.validateTexture(e, e.build(seed), { seed });
      if (report.errors) bad.push(`seed ${seed}: ${report.issues.filter((i) => i.severity === 'error').map((i) => i.code).join(', ')}`);
    }
    if (bad.length) failed++;
    console.log(`${bad.length ? 'FAIL' : 'PASS'} shipped ${e.id}: no errors at seeds 1, 2, 3, 7, 42${bad.length ? `; got ${bad.join('; ')}` : ''}`);
  }
  const shipped = p.TextureCatalog.list().length;
  if (shipped < 23) { failed++; console.log(`FAIL catalog: expected at least 23 registered textures, found ${shipped}`); }

  console.log(`\ntexture self-test: ${cases.length + shipped} cases, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
});
