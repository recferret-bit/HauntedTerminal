import type { Framing } from '../domain/framing.js';
import type { DrawStats } from '../stage/lab-stage.js';
import { ANIMATOR_SOURCE } from '../subjects/part-animator.js';
import type { FxSubjectInfo, Subject, SubjectInfo } from '../subjects/index.js';
import { el, fmt } from './dom.js';

/** Art-bible budgets: [parts, triangles] for a room and for everything else. */
const ROOM_BUDGET = { parts: 80, triangles: 8000 };
const ACTOR_BUDGET = { parts: 40, triangles: 3500 };
const MAX_DEPTH_RATIO = 0.6;
const FX_MAX_PARTICLES = 120;
const FX_MAX_TRIS = 2500;

function row(box: HTMLElement, key: string, value: string, bad = false): void {
  const line = el('div', bad ? 'lab-row lab-row-bad' : 'lab-row');
  line.append(el('span', '', key), el('b', '', value));
  box.append(line);
}

function fxRows(box: HTMLElement, fx: FxSubjectInfo, draw: DrawStats, framing: Framing | null): void {
  const m = fx.metrics;
  row(box, 'fx', fx.id);
  row(box, 'validator', fx.pass ? `PASS (${fx.warnings} warn)` : `FAIL (${fx.errors} err, ${fx.warnings} warn)`, !fx.pass);
  row(box, 'family', `${fx.family} · ${fx.moment} · ${fx.anchor}`);
  row(box, 'trigger', `${fx.event}`);
  row(box, 'when', fx.when);
  row(box, 'timing', `${fx.durationMs} ms${fx.totalMs !== fx.durationMs ? ` (total ${fx.totalMs})` : ''} @ ${fx.stepFps} fps${fx.loop ? ' · loop' : ''}`);
  row(box, 'layers', `${m.layers} (2..6) · particles ${m.instances} / ${FX_MAX_PARTICLES}`, m.layers < 2 || m.layers > 6 || m.instances > FX_MAX_PARTICLES);
  row(box, 'triangles', `${m.triangles} / ${FX_MAX_TRIS} · gpu ${draw.triangles}t/${draw.calls}c`, m.triangles > FX_MAX_TRIS);
  row(box, 'roles P/S/A', `${Math.round(m.share.primary)}% / ${Math.round(m.share.secondary)}% / ${Math.round(m.share.accent)}%`);
  if (m.deltaE !== null) row(box, 'color dE P-S', `${fmt(m.deltaE, 1)} (min 15)`, m.deltaE < 15);
  row(box, 'smallest px', `${fmt(m.minParticlePx, 1)} px`, m.minParticlePx < 3);
  row(box, 'extent', `${fmt(m.bounds.width)} x ${fmt(m.bounds.height)} u${fx.fullPanel ? ' · fullPanel' : ''}`);
  row(box, 'last particle', `${m.lastParticleMs} ms`, m.lastParticleMs > fx.durationMs);
  row(box, 'impact', `shake ${fx.shake} · flash ${fx.flash} · light ${fx.light.zone} p=${fx.light.power}`);
  if (fx.word) row(box, 'word', `"${fx.word.text}" (${fx.word.style}, ${fx.word.zone}, ${fx.word.holdMs}ms)`);
  if (framing) row(box, 'scale', `${fmt(framing.ppu, 1)} px/unit`);
  box.append(el('h4', '', `LAYERS (${fx.layers.length})`));
  for (const l of fx.layers) {
    row(box, `${l.name} (${l.role[0]})`, `${l.zone} x${l.count} ${l.emit}`);
  }
  if (fx.issues.length) {
    box.append(el('h4', '', `ISSUES (${fx.issues.length})`));
    for (const iss of fx.issues) row(box, iss.code, iss.message, iss.severity === 'error');
  }
}

function budgetRows(box: HTMLElement, subject: Subject, i: SubjectInfo, draw: DrawStats, framing: Framing | null): void {
  const budget = subject.category === 'room' ? ROOM_BUDGET : ACTOR_BUDGET;
  row(box, 'parts', `${i.parts} / ${budget.parts}`, i.parts > budget.parts);
  row(box, 'triangles', `${i.triangles} / ${budget.triangles}`, i.triangles > budget.triangles);
  row(box, 'gpu frame', `${draw.triangles} tris, ${draw.calls} calls`);
  row(box, 'size w h d', `${fmt(i.size[0])} ${fmt(i.size[1])} ${fmt(i.size[2])}`);
  row(box, 'min y', fmt(i.minY, 3), !i.tags.includes('hover') && !i.tags.includes('wall') && Math.abs(i.minY) > 0.02);
  row(box, 'depth ratio', `${fmt(i.depthRatio)} (max ${fmt(MAX_DEPTH_RATIO)})`, i.depthRatio > MAX_DEPTH_RATIO);
  if (framing) row(box, 'scale', `${fmt(framing.ppu, 1)} px/unit, ${Math.round(i.size[1] * framing.ppu)} px tall`);
  if (i.tags.length) row(box, 'tags', i.tags.join(' '));
  row(box, 'animator', ANIMATOR_SOURCE);
}

function zoneRows(box: HTMLElement, i: SubjectInfo): void {
  box.append(el('h4', '', `ZONES (${i.zones.length} / 5, share of the front view)`));
  for (const z of i.zones) {
    const line = el('div', 'lab-zone');
    const bar = el('i');
    bar.style.width = `${Math.round(z.share * 100)}%`;
    line.append(el('span', '', `${z.zone} · ${z.family}`), el('b', '', `${Math.round(z.share * 100)}%`), bar);
    box.append(line);
  }
}

/** The info column: the numbers the art bible gives budgets for. */
export function buildInfoPanel(subject: Subject | null, framing: Framing | null, draw: DrawStats): HTMLElement {
  const box = el('div');
  if (!subject) return box;
  if (subject.fxInfo) {
    fxRows(box, subject.fxInfo, draw, framing);
    return box;
  }
  const i = subject.info;
  if (!i) {
    row(box, 'texture', subject.id);
    row(box, 'drawn as', 'uMap on a comic material');
    return box;
  }
  budgetRows(box, subject, i, draw, framing);
  zoneRows(box, i);
  if (i.anim.length) {
    box.append(el('h4', '', 'ANIM TAGS'));
    for (const a of i.anim) row(box, a.part, a.type);
  }
  if (i.sockets.length) row(box, 'sockets', i.sockets.join(' '));
  if (i.textures.length) row(box, 'textures', i.textures.join(' '));
  return box;
}
