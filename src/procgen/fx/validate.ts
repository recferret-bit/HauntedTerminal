import { FX_MOMENTS, FxCatalog } from './catalog.js';
import { createIssueSink, type FxIssue, type FxReport } from './validate-core.js';
import { checkLayers, checkPalette, checkRoleBalance, checkStructure, makeZoneChecker } from './validate-layers.js';
import { checkBudget, checkColors, checkImpact, checkSimulation, checkTime, checkWord } from './validate-preset.js';
import type { FxPreset } from './types.js';

export { FX_FAMILY_ZONES, FX_LIMITS, fxDeltaE } from './validate-core.js';
export type { FxIssue, FxReport, FxSeverity } from './validate-core.js';

/** Check one preset against the comic-effect rules. Pure; needs no WebGL. Rule order is the report order. */
export function validateFxPreset(preset: FxPreset): FxReport {
  const { issues, add } = createIssueSink();
  const layers = preset.layers ?? [];

  checkStructure(preset, add);
  const checkZone = makeZoneChecker(preset, add);
  const validLayers = checkPalette(preset, add, checkZone);
  const stats = checkLayers(preset, add);
  const share = checkRoleBalance(preset, stats.area, add);
  const deltaE = checkColors(validLayers, add);
  checkBudget(layers.length, stats.instances, stats.triangles, stats.vibecoderShapePx, add);
  checkTime(preset, stats.lastParticleMs, add);
  const bounds = checkSimulation(preset, issues, add);
  checkWord(preset, checkZone, add);
  checkImpact(preset, add);

  const errors = issues.filter((i) => i.severity === 'error').length;
  return {
    id: preset.id,
    label: preset.label,
    pass: errors === 0,
    errors,
    warnings: issues.length - errors,
    issues,
    metrics: {
      layers: layers.length,
      instances: stats.instances,
      triangles: stats.triangles,
      share,
      deltaE,
      minParticlePx: Number.isFinite(stats.minParticlePx) ? stats.minParticlePx : 0,
      vibecoderShapePx: stats.vibecoderShapePx,
      bounds,
      lastParticleMs: stats.lastParticleMs,
    },
  };
}

/** Catalog-level check: every game moment has exactly one preset. */
export function validateFxCatalog(): FxIssue[] {
  const issues: FxIssue[] = [];
  const presets = FxCatalog.list();
  for (const moment of FX_MOMENTS) {
    const hits = presets.filter((p) => p.trigger.moment === moment);
    if (hits.length === 0) issues.push({ code: 'FX_MOMENT_MISSING', severity: 'error', message: `no preset answers the moment \`${moment}\`` });
    if (hits.length > 1) {
      issues.push({ code: 'FX_MOMENT_DUPLICATE', severity: 'error', message: `moment \`${moment}\` is answered by ${hits.map((p) => p.id).join(' and ')}` });
    }
  }
  return issues;
}

export function formatFxReport(report: FxReport, opts: { quiet?: boolean } = {}): string {
  const m = report.metrics;
  const status = report.pass ? (report.warnings ? 'PASS*' : 'PASS ') : 'FAIL ';
  const w = m.bounds[2] - m.bounds[0], h = m.bounds[3] - m.bounds[1];
  const head =
    `${status} ${report.id.padEnd(22)} ${String(m.layers)}L ${String(m.instances).padStart(3)}p ${String(m.triangles).padStart(4)}t  ` +
    `area ${m.share.primary.toFixed(0)}/${m.share.secondary.toFixed(0)}/${m.share.accent.toFixed(0)}  ` +
    `dE ${m.deltaE < 0 ? '--' : m.deltaE.toFixed(0)}  min ${m.minParticlePx.toFixed(0)}px  ` +
    `${w.toFixed(1)}x${h.toFixed(1)}u  ${m.lastParticleMs.toFixed(0)}ms`;
  const lines = [head];
  for (const issue of report.issues) {
    if (opts.quiet && issue.severity === 'warning') continue;
    lines.push(`      ${issue.severity === 'error' ? 'ERROR' : 'warn '} ${issue.code}${issue.layer ? ` [${issue.layer}]` : ''}: ${issue.message}`);
  }
  return lines.join('\n');
}
