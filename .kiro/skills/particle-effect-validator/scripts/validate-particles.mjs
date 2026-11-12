#!/usr/bin/env node
// Validate comic FX presets (src/procgen/fx) and draw them as a filmstrip, in software (no browser, no GPU).
//
//   node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all
//   node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs fx.sigkill fx.hop --sheet
//   node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --sheet --out /tmp/fx.png --cols 1 --zoom 2
//   node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --json
//
//   --all            every preset in FxCatalog, plus the catalog check (every game moment has one preset)
//   --json           machine-readable reports
//   --quiet          hide warnings
//   --strict         warnings fail too
//   --sheet          write the filmstrip PNG: one strip per preset, 5 frames across its duration
//   --out <file>     filmstrip path (default scripts/harness/out/fx.png)
//   --cols <n>       strips per row (default 2)
//   --zoom <n>       pixels per world unit as a multiple of game scale 58 (default 1.25)
//   --seed <n>       emission seed (default 1)
//   --floor <1..5>   backdrop colour from FLOOR_THEMES (default 1)
//
// Exit code 1 when any preset has an error (or a warning with --strict), 2 on bad usage.
import { resolve } from 'node:path';
import { withProcgen, parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';
import { writePng } from '../../../../scripts/harness/lib/png.mjs';

const args = parseArgs(process.argv.slice(2), ['--out', '--cols', '--zoom', '--seed', '--floor']);
const FRAME_AT = [0, 0.2, 0.42, 0.66, 0.9];
const PAPER = 0xf4f1ea, INK = 0x110e1b;

await withProcgen(async (p) => {
  const all = args.flag('--all');
  const ids = all ? p.FxCatalog.list().map((e) => e.id) : args.rest;
  if (!ids.length) {
    console.error('usage: validate-particles.mjs <fx id>... | --all  [--json] [--quiet] [--strict] [--sheet [--out file.png] [--cols 2] [--zoom 1.25] [--seed 1] [--floor 1]]');
    console.error(`registered: ${p.FxCatalog.list().map((e) => e.id).join(', ') || '(none)'}`);
    process.exit(2);
  }
  for (const id of ids) {
    if (!p.FxCatalog.has(id)) {
      console.error(`unknown fx preset "${id}"`);
      process.exit(2);
    }
  }

  const reports = ids.map((id) => p.validateFxPreset(p.FxCatalog.get(id)));
  const catalogIssues = all ? p.validateFxCatalog() : [];
  const errors = reports.reduce((s, r) => s + r.errors, 0) + catalogIssues.filter((i) => i.severity === 'error').length;
  const warnings = reports.reduce((s, r) => s + r.warnings, 0);

  if (args.flag('--json')) {
    console.log(JSON.stringify({ reports, catalog: catalogIssues }, null, 2));
  } else {
    console.log('      id                     layers particles tris  area P/S/A  dE  smallest  extent  last particle');
    for (const r of reports) console.log(p.formatFxReport(r, { quiet: args.flag('--quiet') }));
    for (const i of catalogIssues) console.log(`ERROR ${i.code}: ${i.message}`);
    console.log(`\n${reports.length} preset${reports.length === 1 ? '' : 's'}: ${reports.filter((r) => r.pass).length} pass, ${reports.filter((r) => !r.pass).length} fail · ${errors} errors, ${warnings} warnings`);
  }

  if (args.flag('--sheet')) {
    const seed = Number(args.val('--seed', 1));
    const zoom = Number(args.val('--zoom', 1.25));
    const cols = Math.max(1, Number(args.val('--cols', 2)));
    const floor = p.FLOOR_THEMES[Number(args.val('--floor', 1))] ?? p.FLOOR_THEMES[1];
    const frameW = Math.round(3.3 * 58 * zoom), frameH = Math.round(3.0 * 58 * zoom);
    const gutter = 12, border = 3, labelH = 16;
    const stripW = FRAME_AT.length * (frameW + border) + border;
    const stripH = frameH + border * 2;
    const rows = Math.ceil(ids.length / cols);
    const sheet = p.makePixels(gutter + cols * (stripW + gutter), gutter + rows * (labelH + stripH + gutter), PAPER);
    const log = [];

    ids.forEach((id, i) => {
      const preset = p.FxCatalog.get(id);
      const report = reports[i];
      const x = gutter + (i % cols) * (stripW + gutter);
      const y = gutter + Math.floor(i / cols) * (labelH + stripH + gutter);
      // Caption: the id in ink, a red tick when the preset fails. Drawn with the effect lettering font.
      const caption = p.fxLayoutWord(`${id.toUpperCase().replace(/[^A-Z0-9.]/g, '-')}:${preset.durationMs}`, 10);
      for (const [rx, ry, rw, rh] of caption.rects) {
        p.fillRect(sheet, Math.round(x + rx + caption.width / 2), Math.round(y + 2 + caption.height / 2 - ry - rh), Math.round(rw), Math.round(rh), report.pass ? INK : 0xef233c);
      }
      p.fillRect(sheet, x, y + labelH, stripW, stripH, INK);
      // Panel-filling effects are drawn at half scale so the whole thing fits the frame.
      const ppu = 58 * zoom * (preset.fullPanel ? 0.5 : 1);
      FRAME_AT.forEach((f, k) => {
        const tMs = f * preset.durationMs;
        const frame = p.fxRenderFrame(preset, tMs, { seed, width: frameW, height: frameH, pxPerUnit: ppu, background: floor.bg });
        p.blit(sheet, frame, x + border + k * (frameW + border), y + labelH + border);
      });
      log.push(`[row ${Math.floor(i / cols) + 1}, col ${(i % cols) + 1}] ${id}  ${preset.durationMs} ms, frames at ${FRAME_AT.map((f) => Math.round(f * preset.durationMs)).join(' / ')} ms, ${Math.round(ppu)} px per unit${preset.fullPanel ? ' (full panel, half scale)' : ''}${preset.onomatopoeia ? `, word "${preset.onomatopoeia.text}"` : ''}`);
    });
    const out = writePng(resolve(projectRoot, args.val('--out', 'scripts/harness/out/fx.png')), sheet);
    // With --json, stdout stays pure JSON; the cell order goes to stderr.
    const say = args.flag('--json') ? console.error : console.log;
    say(`\nfilmstrip, left to right then top to bottom (each strip: ${FRAME_AT.length} frames left to right):`);
    log.forEach((l) => say(l));
    say(`\nwrote ${out}  (${sheet.width}x${sheet.height})`);
  }

  process.exitCode = errors > 0 || (args.flag('--strict') && warnings > 0) ? 1 : 0;
});
