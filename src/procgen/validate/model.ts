/**
 * Model validator: checks a plain ModelSpec against the art bible
 * (.kiro/skills/haunted-art-direction/SKILL.md) without WebGL.
 * Checks, thresholds and fixes: .kiro/skills/model-geometry-validator.
 *
 *   validateModelSpec(spec)   any ModelSpec
 *   validateModel('door.usb') a registered model, built with a seed
 *   formatModelReport(report) text for the terminal
 */
import { ModelCatalog } from '../core/catalog.js';
import { bakeModel, modelBounds, type BakedPart } from '../geometry/geometry.js';
import type { ModelSpec } from '../core/types.js';
import { checkModelContacts } from './model/contact-checks.js';
import { checkModelBounds } from './model/geometry-checks.js';
import { checkModelRead } from './model/read-checks.js';
import { MODEL_RULES, ModelIssueSink, type ModelIssue, type ModelReport, type ModelStats, type ModelValidateOptions } from './model/rules.js';
import { checkModelSemantics, checkModelStructure, checkModelTriBudget } from './model/semantic-checks.js';

export { MODEL_RULES };
export type { ModelIssue, ModelReport, ModelRules, ModelSeverity, ModelStats, ModelValidateOptions } from './model/rules.js';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function finish(spec: ModelSpec, sink: ModelIssueSink, stats: ModelStats, opts: ModelValidateOptions, started: number): ModelReport {
  const issues: ModelIssue[] = [...sink.issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const count = (severity: ModelIssue['severity']): number => issues.filter((i) => i.severity === severity).length;
  const errors = count('error'), warnings = count('warning');
  stats.ms = Math.round((performance.now() - started) * 10) / 10;
  return {
    id: String(spec.id),
    category: String(spec.category),
    ok: errors === 0 && (!opts.strict || warnings === 0),
    errors,
    warnings,
    infos: count('info'),
    issues,
    stats,
  };
}

/** Validate any ModelSpec. Never throws for a bad model: every problem becomes an issue. */
export function validateModelSpec(spec: ModelSpec, opts: ModelValidateOptions = {}): ModelReport {
  const started = performance.now();
  const rules = opts.rules ?? MODEL_RULES;
  const sink = new ModelIssueSink(opts.disable);
  const stats: ModelStats = {
    parts: Array.isArray(spec.parts) ? spec.parts.length : 0,
    tris: 0, size: [0, 0, 0], minY: 0, zoneShare: {}, emissiveShare: 0, boxFill: 0, hullDeficit: 0, ms: 0,
  };

  if (!checkModelStructure(spec, rules, sink)) return finish(spec, sink, stats, opts, started);

  let baked: BakedPart[];
  try {
    baked = bakeModel(spec);
  } catch (err) {
    sink.add('error', 'BAKE_FAILED', `the model could not be turned into geometry: ${err instanceof Error ? err.message : String(err)}`,
      'Build the spec and inspect the part the message points at; a shape parameter is invalid.');
    return finish(spec, sink, stats, opts, started);
  }
  const bounds = modelBounds(baked);
  stats.tris = bounds.triCount;
  stats.size = [bounds.size[0], bounds.size[1], bounds.size[2]];
  stats.minY = bounds.min[1];
  const broken = baked.filter((b) => b.triCount === 0 || [...b.min, ...b.max].some((v) => !Number.isFinite(v)));
  if (broken.length) {
    sink.add('error', 'DEGENERATE_SHAPE', `${broken.map((b) => `"${b.part.name}"`).join(', ')} baked to no triangles or to non-finite positions`,
      'Check the shape parameters and the transform of these parts.', broken.map((b) => b.part.name));
    return finish(spec, sink, stats, opts, started);
  }

  checkModelTriBudget(spec, baked, bounds.triCount, rules, sink);
  const semantics = !opts.geometryOnly && !sink.disabled('semantics');
  if (semantics) checkModelSemantics(spec, baked, bounds, rules, sink);
  if (!sink.disabled('geometry')) {
    checkModelBounds(spec, bounds, rules, sink);
    checkModelContacts(spec, baked, rules, sink);
  }
  if (!opts.geometryOnly && !sink.disabled('read')) checkModelRead(spec, baked, bounds, rules, sink, stats, opts.seed ?? 1);
  return finish(spec, sink, stats, opts, started);
}

/** Build a registered model and validate it. */
export function validateModel(id: string, opts: ModelValidateOptions = {}): ModelReport {
  const seed = opts.seed ?? 1;
  let spec: ModelSpec;
  try {
    spec = ModelCatalog.build(id, seed);
  } catch (err) {
    const category = id.split('.')[0] ?? '';
    return {
      id, category, seed, ok: false, errors: 1, warnings: 0, infos: 0,
      issues: [{
        code: 'BUILD_FAILED', severity: 'error',
        message: `build(${seed}) threw: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Fix the builder in src/procgen/archetypes; it must return a ModelSpec whose id equals the registered id, for every seed.',
      }],
      stats: { parts: 0, tris: 0, size: [0, 0, 0], minY: 0, zoneShare: {}, emissiveShare: 0, boxFill: 0, hullDeficit: 0, ms: 0 },
    };
  }
  const report = validateModelSpec(spec, opts);
  report.seed = seed;
  if (ModelCatalog.has(id) && ModelCatalog.get(id).category !== spec.category) {
    report.issues.unshift({
      code: 'BAD_ID', severity: 'error',
      message: `registered as category "${ModelCatalog.get(id).category}" but build() returns category "${spec.category}"`,
      fix: 'Make the ModelEntry and the ModelSpec agree.',
    });
    report.errors++;
    report.ok = false;
  }
  return report;
}

export interface ModelReportFormat {
  /** Hide warnings and infos, and the stats line of clean models. */
  quiet?: boolean;
  /** Print the `fix:` line under each issue. Default true. */
  fixes?: boolean;
}

/** Terminal text for one report: a status line, then one block per issue. */
export function formatModelReport(report: ModelReport, format: ModelReportFormat = {}): string {
  const s = report.stats;
  const status = report.ok ? (report.warnings ? 'WARN' : 'PASS') : 'FAIL';
  const tally = [
    report.errors ? `${report.errors} error${report.errors > 1 ? 's' : ''}` : '',
    report.warnings ? `${report.warnings} warning${report.warnings > 1 ? 's' : ''}` : '',
    report.infos ? `${report.infos} info` : '',
  ].filter(Boolean).join(', ');
  const lines = [
    `${status} ${report.id}${report.seed !== undefined && report.seed !== 1 ? ` (seed ${report.seed})` : ''}  ` +
      `${s.parts} parts, ${s.tris} tris, ${s.size[0].toFixed(2)} x ${s.size[1].toFixed(2)} x ${s.size[2].toFixed(2)}` +
      (tally ? `  ${tally}` : ''),
  ];
  if (!format.quiet) {
    const zones = Object.entries(s.zoneShare).filter(([, share]) => share >= 0.005).map(([zoneId, share]) => `${zoneId} ${Math.round(share * 100)}%`);
    if (zones.length) lines.push(`     zones: ${zones.join(', ')}  |  glow ${Math.round(s.emissiveShare * 100)}%, box fill ${Math.round(s.boxFill * 100)}%, hull gap ${Math.round(s.hullDeficit * 100)}%`);
  }
  for (const issue of report.issues) {
    if (format.quiet && issue.severity !== 'error') continue;
    lines.push(`  ${issue.severity.toUpperCase().padEnd(7)} ${issue.code}  ${issue.message}`);
    if (format.fixes !== false) lines.push(`          fix: ${issue.fix}`);
  }
  return lines.join('\n');
}
