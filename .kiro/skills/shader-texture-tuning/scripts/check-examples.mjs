#!/usr/bin/env node
// Checks that the shader examples of this skill still match the real code, without a GPU:
//   - every patch anchor in examples/comic-variants.ts still exists in src/shaders/comic-material.ts
//   - each variant builds, stays a comic material, and declares every uniform it sets
//   - the patched GLSL has balanced braces and still contains the band / rim / flash lines
//   - src/procgen/core/raster.ts still carries the constants it mirrors from the comic shader
// Run from the project root after touching src/shaders/comic-material.ts or the examples:
//
//   node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs
//
// It does not compile GLSL: a compile error shows up in the browser console once the material is on
// screen (npm run dev). The shipped examples were compiled and linked in Chrome when they were written.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withProcgen, projectRoot } from '../../../../scripts/harness/lib/load.mjs';

let failed = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? `: ${detail}` : ''}`);
};

await withProcgen(async (_p, vite) => {
  const comic = await vite.ssrLoadModule('/src/shaders/comic-material.ts');
  const variants = await vite.ssrLoadModule('/.kiro/skills/shader-texture-tuning/examples/comic-variants.ts');
  const glitchPass = await vite.ssrLoadModule('/.kiro/skills/shader-texture-tuning/examples/glitch-pass.ts');

  const base = comic.createComicMaterial(0x1f7a5c, { halftone: true });
  for (const [name, make] of [['glitchVariant', variants.glitchVariant], ['frozenVariant', variants.frozenVariant], ['petrifiedVariant', variants.petrifiedVariant]]) {
    let mat = null, error = '';
    try { mat = make(base); } catch (e) { error = String(e.message ?? e); }
    check(mat !== null, `${name} builds`, error);
    if (!mat) continue;
    const frag = mat.fragmentShader;
    check(comic.isComic(mat) && mat !== base && base.fragmentShader === comic.COMIC_FRAG, `${name} is a separate comic material and leaves the base untouched`);
    const declared = [...frag.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
    const missing = declared.filter((u) => !(u in mat.uniforms));
    const extra = Object.keys(mat.uniforms).filter((u) => !declared.includes(u));
    check(missing.length === 0 && extra.length === 0, `${name} uniforms match its GLSL`, [missing.length ? `declared but not set: ${missing}` : '', extra.length ? `set but not declared: ${extra}` : ''].filter(Boolean).join('; '));
    const depth = [...frag].reduce((d, ch) => (ch === '{' ? d + 1 : ch === '}' ? d - 1 : d), 0);
    check(depth === 0, `${name} GLSL braces balance`);
    const kept = ['float band = shade > 0.66 ? 1.0 : shade > 0.4 ? 0.68 : 0.4;', 'smoothstep(0.55, 0.92, fres) * 0.55', 'col += vec3(0.55, 0.86, 1.0) * att;', 'albedo * band, 0.86'];
    check(kept.every((line) => frag.includes(line)), `${name} keeps bands, map mix, ink rim and flash`);
  }

  const pass = glitchPass.createGlitchPass(800, 450, 2);
  glitchPass.setGlitch(pass, 0.5, 1);
  check(pass.enabled === true && pass.uniforms.uAmount.value === 0.5, 'glitch pass builds and enables on amount');
  glitchPass.setGlitch(pass, 0, 2);
  check(pass.enabled === false, 'glitch pass disables at amount 0');

  // Parity: the software preview must use the same numbers as the fragment shader.
  const raster = readFileSync(resolve(projectRoot, 'src/procgen/core/raster.ts'), 'utf8');
  const frag = comic.COMIC_FRAG;
  const pairs = [
    ['cel bands', 'shade > 0.66 ? 1.0 : shade > 0.4 ? 0.68 : 0.4', 'shade > 0.66 ? 1 : shade > 0.4 ? 0.68 : 0.4'],
    ['map mix 0.86', 'albedo * band, 0.86', 'band * 0.86'],
    ['halftone darkening 0.78', 'mix(1.0, 0.78, dotMask)', '*= 0.78'],
    ['rim power 2.6', 'max(dot(n, viewDir), 0.0), 2.6)', 'Math.pow(1 - facing, 2.6)'],
    ['rim smoothstep 0.55 / 0.92 x 0.55', 'smoothstep(0.55, 0.92, fres) * 0.55', 'smoothstep(0.55, 0.92, fres) * 0.55'],
    ['light direction', '-0.35, 0.82, -0.48', '-0.35, 0.82, -0.48'],
  ];
  const comicSource = readFileSync(resolve(projectRoot, 'src/shaders/comic-material.ts'), 'utf8');
  for (const [name, glsl, ts] of pairs) {
    check((frag.includes(glsl) || comicSource.includes(glsl)) && raster.includes(ts), `parity ${name}`, 'comic-material.ts and raster.ts must both carry this constant');
  }
});

console.log(`\nshader example check: ${failed} failed`);
process.exitCode = failed ? 1 : 0;
