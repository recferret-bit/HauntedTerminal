/**
 * Per-part rules of the AnimTag validator: tag ranges, pivots, detaching motion, blink glow and
 * motion that pushes a part through the floor. One small function per rule.
 */
import { shapeToGeometry } from '../geometry/geometry.js';
import { zone } from '../core/palette.js';
import type { ModelSpec } from '../core/types.js';
import { ANIM_BLINK_GLOW, ANIM_JITTER_GLITCH_GAIN, ANIM_TAG_DEFAULTS, animPoseAt, type AnimTagDefaults } from './tags.js';
import { baseOf, inside, lowestY, type Box } from './validate-geometry.js';
import { HINGED, limbKey, sameMotion, type AddIssue, type Tagged } from './validate-shared.js';

const SAMPLES = 24;

/** Everything a per-part rule needs to look at. */
export interface PartCheck {
  spec: ModelSpec;
  part: Tagged;
  def: AnimTagDefaults;
  speed: number;
  amp: number;
  /** Box of the part at rest, model space. */
  rest: Box;
  /** Box of the whole model at rest. */
  model: Box;
  tagged: Tagged[];
  /** Pivot-to-limb gaps from `limbPivotGaps`. */
  limbGap: Map<string, number>;
  /** Limbs already reported as detached, so a limb with several parts is reported once. */
  reportedLimb: Set<string>;
  add: AddIssue;
}

export function makePartCheck(
  shared: Pick<PartCheck, 'spec' | 'model' | 'tagged' | 'limbGap' | 'reportedLimb' | 'add'>,
  part: Tagged,
  rest: Box,
): PartCheck {
  const def = ANIM_TAG_DEFAULTS[part.anim.type];
  return { ...shared, part, def, speed: part.anim.speed ?? def.speed, amp: part.anim.amp ?? def.amp, rest };
}

function checkRanges({ part, def, speed, amp, add }: PartCheck): void {
  const tag = part.anim;
  if (!Number.isFinite(speed) || speed === 0 || Math.abs(speed) > def.maxSpeed || (speed < 0 && tag.type !== 'spin' && tag.type !== 'orbit')) {
    add('error', 'ANIM_SPEED_RANGE', part.name, `${tag.type} speed ${speed} is outside (0, ${def.maxSpeed}] cycles/s (only spin and orbit may run backwards)`);
  }
  // A negative amp is a mirrored swing, so the range is on |amp|. Blink's amp is a duty and cannot be negative.
  if (tag.type !== 'spin' && (!Number.isFinite(amp) || Math.abs(amp) > def.maxAmp || (tag.type === 'blink' && amp < 0))) {
    add('error', 'ANIM_AMP_RANGE', part.name, `${tag.type} amp ${amp} is outside [-${def.maxAmp}, ${def.maxAmp}] ${def.unit}`);
  }
  if (tag.phase !== undefined && (!(tag.phase >= 0) || tag.phase > 1)) {
    add('error', 'ANIM_PHASE_RANGE', part.name, `phase ${tag.phase} is outside 0..1`);
  }
  const disk = tag.squash !== undefined || tag.tilt !== undefined || tag.sway !== undefined;
  if (disk && tag.type !== 'orbit') {
    add('error', 'ANIM_DISK_FIELDS', part.name, `squash / tilt / sway only mean something on orbit, not ${tag.type}`);
  } else if (disk && (!((tag.squash ?? 1) > 0) || (tag.squash ?? 1) > 1 || Math.abs(tag.sway ?? 0) > 0.5 || !Number.isFinite(tag.tilt ?? 0))) {
    add('error', 'ANIM_DISK_FIELDS', part.name, `orbit disk needs squash in (0, 1], |sway| <= 0.5 units and a finite tilt`);
  }
}

function checkPivot({ part, amp, model, limbGap, reportedLimb, add }: PartCheck): void {
  const tag = part.anim;
  if (!tag.pivot) return;
  if (!inside(tag.pivot, model, 0.15)) {
    add('error', 'ANIM_PIVOT_OUTSIDE', part.name, `pivot [${tag.pivot.join(', ')}] is outside the model bounds`);
    return;
  }
  if (!HINGED.has(tag.type)) return;
  // How far the limb's end nearest the pivot travels: gap to the limb times the swing angle.
  const key = limbKey(part);
  const gap = limbGap.get(key) ?? 0;
  const travel = gap * Math.abs(amp);
  if (travel > 0.04 && !reportedLimb.has(key)) {
    reportedLimb.add(key);
    add(travel > 0.12 ? 'error' : 'warn', 'ANIM_PIVOT_DETACHED', part.name, `${tag.type} pivot is ${gap.toFixed(2)} units off the limb, so its near end travels ${travel.toFixed(2)} units: it will orbit the pivot instead of hinging on it`);
  }
}

function checkBob({ spec, part, def, amp, rest, tagged, add }: PartCheck): void {
  const tag = part.anim;
  if (tag.type !== 'bob') return;
  const axis = tag.axis ?? def.axis;
  if (axis === 'z') add('warn', 'ANIM_INVISIBLE_AXIS', part.name, 'bob along z cannot be seen by the front orthographic camera; use x or y');
  // A part that bobs alone slides against its neighbours; parts that bob together are one floating body.
  const alone = spec.parts.length > 1 && !tagged.some((o) => o !== part && sameMotion(o.anim, tag));
  const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const span = rest.max[k]! - rest.min[k]!;
  const reach = Math.abs(amp);
  if (alone && reach > Math.max(0.03, span)) {
    add(reach > Math.max(0.06, span * 2) ? 'error' : 'warn', 'ANIM_DETACH', part.name, `bob moves the part ${reach.toFixed(3)} units, more than its own size (${span.toFixed(3)}): it will detach from the model`);
  }
}

function checkJitter({ part, amp, add }: PartCheck): void {
  if (part.anim.type === 'jitter' && Math.abs(amp) * ANIM_JITTER_GLITCH_GAIN > 0.12) {
    add('warn', 'ANIM_DETACH', part.name, `jitter glitch frames throw the part ${(Math.abs(amp) * ANIM_JITTER_GLITCH_GAIN).toFixed(3)} units (over 0.12, about 7 px): it reads as a part falling off, not a glitch`);
  }
}

function checkBlink({ part, add }: PartCheck): void {
  if (part.anim.type === 'blink' && !(zone(part.zone).emissive ?? 0)) {
    add('warn', 'ANIM_BLINK_NOT_EMISSIVE', part.name, `"${part.zone}" does not glow: the animator lends this blink ${ANIM_BLINK_GLOW} emissive while lit. Prefer an emissive zone (a signal zone, malwareEye) so it also glows when nothing animates it`);
  }
}

/** Sweep one cycle at full locomotion on the real vertices: does the motion push the part into the floor? */
function checkBelowGround({ spec, part, speed, add }: PartCheck): void {
  const tag = part.anim;
  const base = baseOf(part);
  const geo = shapeToGeometry(part.shape);
  const vertices = geo.getAttribute('position').array as Float32Array;
  if (lowestY(vertices, base) >= -0.02) {
    let low = Infinity;
    const period = 1 / Math.max(0.05, Math.abs(speed));
    const span = tag.type === 'jitter' ? 4 : period;
    const n = tag.type === 'jitter' ? 96 : SAMPLES;
    for (let i = 0; i < n; i++) {
      low = Math.min(low, lowestY(vertices, animPoseAt(tag, base, (i / n) * span, { fps: 0, locomotion: 1, name: `${spec.id}/${part.name}` })));
    }
    if (low < -0.035) {
      add(low < -0.08 ? 'error' : 'warn', 'ANIM_BELOW_GROUND', part.name, `${tag.type} pushes the part to y = ${low.toFixed(3)}, through the floor (y < 0)`);
    }
  }
  geo.dispose();
}

/** Run every per-part rule, in report order. */
export function checkPart(c: PartCheck): void {
  checkRanges(c);
  checkPivot(c);
  checkBob(c);
  checkJitter(c);
  checkBlink(c);
  checkBelowGround(c);
}
