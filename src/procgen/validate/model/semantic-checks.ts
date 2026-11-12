import type { BakedPart, ModelBounds } from '../../geometry/geometry.js';
import { isHostile, type ModelSpec, type PartSpec } from '../../core/types.js';
import { finite, finiteVec } from './structure-checks.js';
import { modelPartList, type ModelIssueSink, type ModelRules } from './rules.js';
import { modelZoneDef } from './zone-info.js';

export { checkModelStructure, checkModelTriBudget } from './structure-checks.js';

const AXES = ['x', 'y', 'z'];

function family(part: PartSpec): string | undefined {
  return modelZoneDef(part.zone)?.family;
}

const names = (list: PartSpec[]): string[] => list.map((p) => p.name);

/** The art bible's palette families: warm "human" zones are the vibecoder's, magenta/violet are the enemy's. */
function checkPaletteFamilies(spec: ModelSpec, sink: ModelIssueSink): void {
  const cat = spec.category;
  const human = spec.parts.filter((p) => family(p) === 'human');
  if (human.length && cat !== 'vibecoder' && spec.id !== 'room.outro' && spec.id !== 'room.intro') {
    sink.add('error', 'HUMAN_ZONE_MISUSE',
      `${modelPartList(names(human))} use${human.length > 1 ? '' : 's'} human zones (${[...new Set(human.map((p) => p.zone))].join(', ')}) on a ${cat}: warm colour means "the vibecoder"`,
      'Use hardware zones instead: plastic for pale, copper or gold for warm, rubber or silicon for dark. Light is powerAmber, not lantern.', names(human));
  }
  const corrupt = spec.parts.filter((p) => family(p) === 'malware');
  if (corrupt.length && !isHostile(cat)) {
    sink.add('error', 'MALWARE_ZONE_MISUSE',
      `${modelPartList(names(corrupt))} use${corrupt.length > 1 ? '' : 's'} malware zones (${[...new Set(corrupt.map((p) => p.zone))].join(', ')}) on a ${cat}: magenta and violet mean "this will hurt you"`,
      'Use hardware, signal or glass zones. lockRed is the system saying no; dataCyan and phosphor are system light.', names(corrupt));
  }
}

/** Number of groups of eye parts whose boxes are within `gap` of each other. */
function eyeClusters(eyes: BakedPart[], gap: number): number {
  const cluster = eyes.map((_, i) => i);
  const find = (i: number): number => (cluster[i] === i ? i : (cluster[i] = find(cluster[i])));
  for (let i = 0; i < eyes.length; i++) {
    for (let j = i + 1; j < eyes.length; j++) {
      let g2 = 0;
      for (let c = 0; c < 3; c++) {
        const g = Math.max(eyes[i].min[c] - eyes[j].max[c], eyes[j].min[c] - eyes[i].max[c], 0);
        g2 += g * g;
      }
      if (Math.sqrt(g2) <= gap) cluster[find(i)] = find(j);
    }
  }
  return new Set(eyes.map((_, i) => find(i))).size;
}

/** One glowing eye or core, found by name and by zone. */
function checkMalwareEye(baked: BakedPart[], rules: ModelRules, sink: ModelIssueSink): void {
  const eyes = baked.filter((b) => b.part.zone === 'malwareEye');
  if (!eyes.length) {
    sink.add('error', 'MALWARE_NO_EYE', 'no part uses the malwareEye zone: every hostile thing has one glowing eye or core',
      `Add an eye, core or keyhole part in zone malwareEye on the −z face, with "eye" or "core" in its name.`);
    return;
  }
  const eyeNames = eyes.map((b) => b.part.name);
  const clusters = eyeClusters(eyes, rules.malware.eyeClusterGap);
  if (clusters > rules.malware.maxEyeClusters) {
    sink.add('warning', 'MALWARE_EYE_COUNT',
      `${clusters} separate malwareEye clusters (${modelPartList(eyeNames)}): the focal point is diluted`,
      'Keep one eye or core (a pair of eyes is allowed). Move the other glowing bits to toxicGreen or corruptMagenta, which do not glow.',
      eyeNames);
  }
  if (!eyes.some((b) => rules.malware.eyeNames.some((word) => b.part.name.toLowerCase().includes(word)))) {
    sink.add('warning', 'MALWARE_EYE_NAME', `no malwareEye part is named with ${rules.malware.eyeNames.map((w) => `"${w}"`).join(' or ')} (found: ${modelPartList(eyeNames)})`,
      'Rename the focal part (eye, core_glow, keyhole): the animation and FX code find it by name.', eyeNames);
  }
}

/** Malware and bosses: corruption zone, one eye, jitter anim, sockets. */
function checkHostile(spec: ModelSpec, baked: BakedPart[], rules: ModelRules, sink: ModelIssueSink): void {
  const parts = spec.parts;
  if (!parts.some((p) => family(p) === 'malware' && p.zone !== 'malwareEye')) {
    sink.add('error', 'MALWARE_NO_CORRUPTION', 'no part uses a corruption zone (corruptMagenta, corruptViolet, toxicGreen, voidPurple, ghostViolet): it reads as plain hardware',
      'Put the parts that took the hardware over (spikes, growths, claws, cracks) in a malware-family zone.');
  }
  checkMalwareEye(baked, rules, sink);
  if (!parts.some((p) => p.anim?.type === 'jitter')) {
    sink.add('error', 'MALWARE_NO_JITTER', 'no part has a jitter anim: the glitch twitch is the malware signature',
      "Add anim: { type: 'jitter' } to a corrupted part (a spike, the eye, a growth), not to the whole body.");
  }
  const missing = rules.malware.sockets.filter((s) => !(s in (spec.sockets ?? {})));
  if (missing.length) {
    sink.add('error', 'MISSING_SOCKET', `missing socket${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} (hostile models need ${rules.malware.sockets.join(', ')})`,
      'Add them to spec.sockets: bubble above the head, eye at the malwareEye part on the −z face, fx at the centre of mass.');
  }
}

/** Pickups hover, glow and always move. */
function checkPickup(spec: ModelSpec, rules: ModelRules, sink: ModelIssueSink): void {
  const parts = spec.parts;
  if (!(spec.tags ?? []).includes('hover')) {
    sink.add('error', 'PICKUP_NOT_HOVER', "pickups float: the model is not tagged 'hover'",
      "Add tags: ['hover'] and centre the model around y = 0.5.");
  }
  if (!parts.some((p) => family(p) === 'signal')) {
    sink.add('error', 'PICKUP_NO_SIGNAL', 'no part uses a signal zone (phosphor, dataCyan, powerAmber, lockRed): a pickup must glow to say "take me"',
      'Add an emissive detail on the −z face: an LED, a core, a notch light.');
  }
  if (!parts.some((p) => p.anim && rules.pickup.anims.includes(p.anim.type))) {
    sink.add('error', 'PICKUP_NOT_ANIMATED', `no part has a ${rules.pickup.anims.join(' / ')} anim: pickups always move`,
      "Give the parts anim: { type: 'bob' } (same speed and phase on every part), plus spin or pulse on the light.");
  }
}

/** Doors show their state with one glowing LED and expose a lock socket. */
function checkDoor(spec: ModelSpec, rules: ModelRules, sink: ModelIssueSink): void {
  const parts = spec.parts;
  const led = rules.door.ledName;
  if (!parts.some((p) => p.name.toLowerCase().includes(led) && family(p) === 'signal')) {
    const named = parts.filter((p) => p.name.toLowerCase().includes(led));
    sink.add('error', 'DOOR_NO_LED',
      named.length
        ? `"${named[0].name}" is in zone ${named[0].zone}, not a signal zone: the status LED must glow`
        : `no part named "${led}" in a signal zone: every door shows its state with one LED (red locked, amber busy, green open)`,
      `Add a small part with "${led}" in its name, zone lockRed (the game recolours it), outline: false, on the −z face.`);
  }
  const missing = rules.door.sockets.filter((s) => !(s in (spec.sockets ?? {})));
  if (missing.length) {
    sink.add('error', 'MISSING_SOCKET', `missing socket: ${missing.join(', ')}`,
      'Add sockets: { lock: [x, y, z] } where the lock / padlock FX attaches, on the −z face.');
  }
}

/** The vibecoder walks (leg and arm tags) and the dev carries the lantern. */
function checkVibecoder(spec: ModelSpec, sink: ModelIssueSink): void {
  const parts = spec.parts;
  const tags = spec.tags ?? [];
  if (spec.id === 'vibecoder.dev' || (!tags.includes('hover') && !tags.includes('wall'))) {
    const lacking = (['legWalk', 'armSwing'] as const).filter((t) => !parts.some((p) => p.anim?.type === t));
    if (lacking.length) {
      sink.add('error', 'VIBECODER_NO_WALK_TAGS', `no part is tagged ${lacking.join(' or ')}: a vibecoder that stands on the floor must walk`,
        "Tag the leg parts with anim: { type: 'legWalk' } and the arm parts with { type: 'armSwing' }, left and right half a cycle apart (phase 0 and 0.5), pivot at the hip / shoulder.");
    }
  }
  if (spec.id === 'vibecoder.dev' && !parts.some((p) => p.zone === 'lantern')) {
    sink.add('error', 'VIBECODER_NO_LANTERN', 'vibecoder.dev has no part in the lantern zone: the lantern is the one light he carries',
      'Add the lantern (zone lantern) held out at the screen-right side (−x).');
  }
}

/** Tests whether a model-space point lies farther than the allowed margin outside the model's bounds. */
function outsideTest(bounds: ModelBounds, rules: ModelRules): { margin: number; outside: (p: readonly number[]) => boolean } {
  const extent = Math.max(bounds.size[0], bounds.size[1], bounds.size[2]);
  const margin = Math.max(rules.sockets.marginMin, rules.sockets.marginRatio * extent);
  return { margin, outside: (p) => p.some((v, c) => v < bounds.min[c] - margin || v > bounds.max[c] + margin) };
}

function checkSockets(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const { margin, outside } = outsideTest(bounds, rules);
  for (const [key, value] of Object.entries(spec.sockets ?? {})) {
    if (!finiteVec(value, 3)) {
      sink.add('error', 'NON_FINITE', `socket "${key}" must be three finite numbers`, 'Fix the socket position.');
    } else if (spec.category !== 'fx' && outside(value)) {
      sink.add('warning', 'SOCKET_OUT_OF_BOUNDS',
        `socket "${key}" at [${value.map((v) => v.toFixed(2)).join(', ')}] is more than ${margin.toFixed(2)} outside the model (x ${bounds.min[0].toFixed(2)}..${bounds.max[0].toFixed(2)}, y ${bounds.min[1].toFixed(2)}..${bounds.max[1].toFixed(2)}, z ${bounds.min[2].toFixed(2)}..${bounds.max[2].toFixed(2)})`,
        'Sockets are in model space (same frame as part.pos). Put it on or just outside the part it refers to.');
    }
  }
}

type AnimLimits = { maxSpeed: number; maxAmp: number };

/** Anim values that are out of the comic-timing ranges. */
function animRangeProblems(anim: NonNullable<PartSpec['anim']>, limits: AnimLimits): string[] {
  const odd: string[] = [];
  if (anim.speed !== undefined && (Math.abs(anim.speed) > limits.maxSpeed || anim.speed === 0)) odd.push(`speed ${anim.speed} (0 < |speed| <= ${limits.maxSpeed} cycles/s)`);
  if (anim.amp !== undefined && Math.abs(anim.amp) > limits.maxAmp) odd.push(`amp ${anim.amp} (|amp| <= ${limits.maxAmp})`);
  if (anim.phase !== undefined && (anim.phase < 0 || anim.phase > 1)) odd.push(`phase ${anim.phase} (0..1)`);
  return odd;
}

/** Validity of one anim tag; returns null when the tag is unusable (later range checks are skipped). */
function checkAnimValid(part: PartSpec, anim: NonNullable<PartSpec['anim']>, rules: ModelRules, sink: ModelIssueSink): AnimLimits | null {
  const limits = (rules.anim as Record<string, AnimLimits | undefined>)[anim.type];
  if (!limits) {
    sink.add('error', 'ANIM_INVALID', `"${part.name}": unknown anim type "${String(anim.type)}"`,
      `Use one of: ${Object.keys(rules.anim).join(', ')}.`, part.name);
    return null;
  }
  if (anim.axis !== undefined && !AXES.includes(anim.axis)) {
    sink.add('error', 'ANIM_INVALID', `"${part.name}": anim axis "${String(anim.axis)}" is not x, y or z`, "Use 'x', 'y' or 'z'.", part.name);
  }
  const bad: string[] = [];
  for (const key of ['speed', 'amp', 'phase'] as const) {
    if (anim[key] !== undefined && !finite(anim[key])) bad.push(key);
  }
  if (anim.pivot !== undefined && !finiteVec(anim.pivot, 3)) bad.push('pivot');
  if (bad.length) {
    sink.add('error', 'ANIM_INVALID', `"${part.name}": anim ${bad.join(', ')} is not a finite number`, 'Fix the value in the builder.', part.name);
    return null;
  }
  return limits;
}

function checkAnimTags(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const { outside } = outsideTest(bounds, rules);
  for (const part of spec.parts) {
    const anim = part.anim;
    if (!anim) continue;
    const limits = checkAnimValid(part, anim, rules, sink);
    if (!limits) continue;
    const odd = animRangeProblems(anim, limits);
    if (odd.length) {
      sink.add('warning', 'ANIM_RANGE', `"${part.name}" ${anim.type}: ${odd.join('; ')}`,
        'Bring the value into range. amp is world units for bob / jitter / orbit, radians for swing / legWalk / armSwing, a scale delta for pulse / breathe.', part.name);
    }
    if (anim.pivot && spec.category !== 'fx' && outside(anim.pivot)) {
      sink.add('warning', 'ANIM_PIVOT_OUTSIDE',
        `"${part.name}" ${anim.type}: pivot [${anim.pivot.map((v) => v.toFixed(2)).join(', ')}] is outside the model`,
        'pivot is in model space, not relative to the part. Put it at the joint (hip, shoulder, hinge, hub).', part.name);
    }
  }
}

/** Palette families, category contracts, sockets and anim tags: the art bible as code. */
export function checkModelSemantics(spec: ModelSpec, baked: BakedPart[], bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const cat = spec.category;
  checkPaletteFamilies(spec, sink);
  if (isHostile(cat)) checkHostile(spec, baked, rules, sink);
  if (cat === 'pickup') checkPickup(spec, rules, sink);
  if (cat === 'door') checkDoor(spec, rules, sink);
  if (cat === 'vibecoder') checkVibecoder(spec, sink);
  checkSockets(spec, bounds, rules, sink);
  checkAnimTags(spec, bounds, rules, sink);
}
