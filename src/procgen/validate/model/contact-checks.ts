import type { BakedPart } from '../../geometry/geometry.js';
import type { ModelSpec } from '../../core/types.js';
import {
  boxGap, boxInside, coplanarOverlap, facingTris, firstVertexInside, makeGeo, surfaceDistance, type Geo,
} from './contact-geometry.js';
import { modelPartList, type ModelIssueSink, type ModelRules } from './rules.js';
import { modelPartTranslucent } from './zone-info.js';

const f = (n: number, digits = 3): string => n.toFixed(digits);

/** Everything the contact passes share: the baked parts, their contact-space geometry and pairwise distances. */
interface ContactCtx {
  spec: ModelSpec;
  baked: BakedPart[];
  geos: Geo[];
  rules: ModelRules;
  sink: ModelIssueSink;
  n: number;
  /** Surface distance per part pair (n × n), Infinity beyond the near-miss reach. */
  dist: Float64Array;
  name(i: number): string;
}

/** Distances and what the pairwise pass learned: which parts are buried and which faces fight. */
interface PairResult {
  buriedIn: Int32Array;
  fights: { a: number; b: number; px: number }[];
}

/** Pairwise relations: surface distance, burial inside a closed solid and coplanar camera-facing faces. */
function measurePairs(ctx: ContactCtx): PairResult {
  const { baked, geos, rules, sink, n, dist } = ctx;
  const { contactTol, nearMiss } = rules.contact;
  const buriedIn = new Int32Array(n).fill(-1);
  const facing: (Float64Array | null)[] = new Array(n).fill(null);
  const face = (i: number): Float64Array => (facing[i] ??= facingTris(baked[i].pos, rules.zfight.facingZ));
  const pxArea = rules.gamePxPerUnit * rules.gamePxPerUnit;
  const fights: PairResult['fights'] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = geos[i], b = geos[j];
      if (boxGap(a, b) > nearMiss) continue;
      const nested = boxInside(a, b, 1e-4) || boxInside(b, a, 1e-4);
      // For nested boxes we need to know whether the surfaces really cross, so do not stop early.
      let d = surfaceDistance(a, b, nearMiss, nested ? 0 : contactTol);
      if (d > 1e-6 && nested) {
        const aInB = firstVertexInside(a, b), bInA = !aInB && firstVertexInside(b, a);
        if (aInB || bInA) {
          const inner = aInB ? i : j, outer = aInB ? j : i;
          if (!modelPartTranslucent(baked[outer].part) && !modelPartTranslucent(baked[inner].part)) buriedIn[inner] = outer;
          d = 0;
        }
      }
      dist[i * n + j] = dist[j * n + i] = d;

      if (d <= contactTol && !sink.disabled('COPLANAR_ZFIGHT')) {
        const pa = baked[i].part, pb = baked[j].part;
        if (pa.zone === pb.zone && pa.texture === pb.texture) continue;
        const px = coplanarOverlap(baked[i], face(i), baked[j], face(j), a.boxes, b.boxes, rules) * pxArea;
        if (px >= rules.zfight.minOverlapPx) fights.push({ a: i, b: j, px });
      }
    }
  }
  return { buriedIn, fights };
}

function reportBuried(ctx: ContactCtx, buriedIn: Int32Array): void {
  const { baked, sink, n, name } = ctx;
  for (let i = 0; i < n; i++) {
    const outer = buriedIn[i];
    if (outer < 0) continue;
    const animated = !!baked[i].part.anim;
    sink.add(animated ? 'warning' : 'error', 'BURIED_PART',
      `"${name(i)}" is entirely inside "${name(outer)}" and can never be seen${animated ? ' in its rest pose' : ''}`,
      `Move "${name(i)}" so it breaks the surface of "${name(outer)}" on the −z (camera) side, or delete it.`, [name(i), name(outer)]);
  }
}

function reportCoplanar(ctx: ContactCtx, fights: PairResult['fights']): void {
  const { baked, sink, name } = ctx;
  for (const z of fights) {
    sink.add('error', 'COPLANAR_ZFIGHT',
      `"${name(z.a)}" (${baked[z.a].part.zone}) and "${name(z.b)}" (${baked[z.b].part.zone}) have camera-facing faces in the same plane, overlapping over ~${Math.round(z.px)} px at game scale: they will flicker`,
      'Offset one of the two by at least 0.01 in z (toward −z for the one that should be on top), or make it thicker/thinner so the faces are not level.',
      [name(z.a), name(z.b)]);
  }
}

/** Contact components. Tubes are held but never hold unless `viaTubes`. */
interface Components {
  comp: Int32Array;
  comps: number[][];
  main: number;
}

/** Flood fill over touching parts from `seedIdx`, labelling `comp` with `id` and collecting members into `into`. */
function flood(ctx: ContactCtx, comp: Int32Array, seedIdx: number, viaTubes: boolean, id: number, into: number[]): void {
  const { geos, rules, n, dist } = ctx;
  const stack = [seedIdx];
  comp[seedIdx] = id;
  while (stack.length) {
    const cur = stack.pop() as number;
    into.push(cur);
    if (geos[cur].tube && !viaTubes) continue;
    for (let k = 0; k < n; k++) {
      if (comp[k] !== -1 || !(dist[cur * n + k] <= rules.contact.contactTol)) continue;
      comp[k] = id;
      stack.push(k);
    }
  }
}

/** Connected components over every contact (tubes included); `main` is the one with the most surface. */
function findComponents(ctx: ContactCtx): Components {
  const { geos, n } = ctx;
  const comp = new Int32Array(n).fill(-1);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (comp[i] !== -1) continue;
    const members: number[] = [];
    flood(ctx, comp, i, true, comps.length, members);
    comps.push(members);
  }
  const weight = (members: number[]): number => members.reduce((s, m) => s + geos[m].area, 0);
  let main = 0;
  for (let c = 1; c < comps.length; c++) if (weight(comps[c]) > weight(comps[main])) main = c;
  return { comp, comps, main };
}

/** A part that is meant to fly free (orbit, satellite, detached tag) is exempt from the support checks. */
function optedOut(ctx: ContactCtx, i: number): boolean {
  const { spec, baked, rules } = ctx;
  const part = baked[i].part;
  if (!part.anim || !rules.contact.detachAnims.includes(part.anim.type)) return false;
  if ((spec.tags ?? []).includes(rules.contact.detachTag)) return true;
  const lower = part.name.toLowerCase();
  return rules.contact.detachNames.some((word) => lower.includes(word));
}

interface Link {
  comp: number;
  from: number;
  to: number;
  gap: number;
}

/** The loose component closest to any already-attached part, or null when none can be reached. */
function nearestLoose(ctx: ContactCtx, cs: Components, loose: Set<number>, attached: Uint8Array): Link | null {
  const { n, dist } = ctx;
  let best: Link | null = null;
  for (const c of loose) {
    for (const m of cs.comps[c]) {
      for (let k = 0; k < n; k++) {
        if (!attached[cs.comp[k]]) continue;
        const d = dist[m * n + k];
        if (d < (best?.gap ?? Infinity)) best = { comp: c, from: m, to: k, gap: d };
      }
    }
  }
  return best;
}

/** A gap that exists only in depth is invisible to the front camera; otherwise it is a real hairline gap. */
function reportGap(ctx: ContactCtx, cs: Components, link: Link): void {
  const { baked, rules, sink, name } = ctx;
  const { contactTol, nearMiss, zWeight } = rules.contact;
  const members = cs.comps[link.comp].map(name);
  const carries = members.length > 1 ? ` (and carries ${modelPartList(members.filter((m) => m !== name(link.from)))})` : '';
  const flat = surfaceDistance(makeGeo(baked[link.from], 1e-4), makeGeo(baked[link.to], 1e-4), nearMiss, contactTol);
  if (flat <= contactTol) {
    sink.add('info', 'DEPTH_GAP',
      `"${name(link.from)}" sits about ${f(link.gap / zWeight, 2)} away from "${name(link.to)}" in depth${carries}: invisible to the front camera, but they do not touch`,
      `Nothing to fix for the picture. For a clean model, move "${name(link.from)}" in z until it overlaps "${name(link.to)}" by ~0.01.`,
      [name(link.from), name(link.to)]);
  } else {
    sink.add('warning', 'HAIRLINE_GAP',
      `"${name(link.from)}" stops ${f(link.gap)} short of "${name(link.to)}"${carries}: the ink shells will bridge it, but nothing holds it`,
      `Move "${name(link.from)}" ${f(link.gap + 0.01)} toward "${name(link.to)}" (or lengthen it) so the two overlap by about 0.01.`,
      [name(link.from), name(link.to)]);
  }
}

/** A component that nothing connects to the body: floating. */
function reportFloating(ctx: ContactCtx, cs: Components, c: number): void {
  const { baked, rules, sink, n, name } = ctx;
  const members = cs.comps[c];
  let nearest = -1, gap = Infinity;
  for (const m of members) {
    for (let k = 0; k < n; k++) {
      if (cs.comp[k] === c) continue;
      const d = boxGap(baked[m], baked[k]);
      if (d < gap) { gap = d; nearest = k; }
    }
  }
  const names = members.map(name);
  sink.add('error', 'FLOATING_PART',
    `${names.length > 1 ? `${names.length} parts (${modelPartList(names)}) float` : `"${names[0]}" floats`} free of the body${nearest >= 0 ? `; nearest part is "${name(nearest)}", more than ${f(Math.max(gap, rules.contact.nearMiss), 2)} away` : ''}`,
    `Move it until it overlaps its support by ~0.01, or add a connecting part (bracket, neck, cable). If it is meant to fly apart from the body, give it an 'orbit', 'bob' or 'spin' anim and put 'float', 'orbit' or 'satellite' in its name (or tag the model '${rules.contact.detachTag}').`,
    names);
}

/** Attach loose components nearest-first, so one missing link is reported once; the rest float. */
function reportSupport(ctx: ContactCtx, cs: Components): void {
  const attached = new Uint8Array(cs.comps.length);
  attached[cs.main] = 1;
  const loose = new Set<number>();
  for (let c = 0; c < cs.comps.length; c++) {
    if (c !== cs.main && !cs.comps[c].some((m) => optedOut(ctx, m))) loose.add(c);
  }
  for (let link = nearestLoose(ctx, cs, loose, attached); link; link = nearestLoose(ctx, cs, loose, attached)) {
    reportGap(ctx, cs, link);
    attached[link.comp] = 1;
    loose.delete(link.comp);
  }
  for (const c of loose) reportFloating(ctx, cs, c);
}

/** Held only by a cable: walk the main component again without passing through tubes. */
function reportTubeOnlySupport(ctx: ContactCtx, cs: Components): void {
  const { geos, sink, name } = ctx;
  if (sink.disabled('TUBE_ONLY_SUPPORT')) return;
  const mainMembers = cs.comps[cs.main];
  let root = mainMembers[0];
  for (const m of mainMembers) if (!geos[m].tube && (geos[root].tube || geos[m].area > geos[root].area)) root = m;
  if (geos[root].tube) return;
  cs.comp.fill(-1);
  flood(ctx, cs.comp, root, false, 0, []);
  const dangling = mainMembers.filter((m) => cs.comp[m] === -1 && !optedOut(ctx, m));
  if (!dangling.length) return;
  sink.add('info', 'TUBE_ONLY_SUPPORT',
    `${modelPartList(dangling.map(name))} ${dangling.length > 1 ? 'are' : 'is'} joined to the body only through a tube`,
    'Fine for something that hangs or dangles on a cable or chain. If it is meant to be rigid, add a solid bracket or overlap it with the body.',
    dangling.map(name));
}

/** Floating parts, hairline gaps, tube-only support, buried parts, coplanar faces. */
export function checkModelContacts(spec: ModelSpec, baked: BakedPart[], rules: ModelRules, sink: ModelIssueSink): void {
  if (spec.category === 'fx' || baked.length < 2) return;
  const n = baked.length;
  const ctx: ContactCtx = {
    spec, baked, rules, sink, n,
    geos: baked.map((b) => makeGeo(b, rules.contact.zWeight)),
    dist: new Float64Array(n * n).fill(Infinity),
    name: (i) => baked[i].part.name,
  };
  const { buriedIn, fights } = measurePairs(ctx);
  reportBuried(ctx, buriedIn);
  reportCoplanar(ctx, fights);
  const cs = findComponents(ctx);
  reportSupport(ctx, cs);
  reportTubeOnlySupport(ctx, cs);
}
