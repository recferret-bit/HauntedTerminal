import type { ModelBounds } from '../../geometry/geometry.js';
import type { ModelSpec } from '../../core/types.js';
import type { ModelIssueSink, ModelRules } from './rules.js';

const f = (n: number, digits = 3): string => n.toFixed(digits);

/** Grounding: feet on the floor, hover band, wall mounts, room floors. */
function checkGrounding(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const tags = spec.tags ?? [];
  const minY = bounds.min[1];
  const cat = spec.category;
  const g = rules.ground;
  if (tags.includes('wall')) return; // Mounted on the back wall: free.
  if (tags.includes('hover')) {
    const floor = cat === 'pickup' ? g.pickupMinClearance : -g.tol;
    if (minY >= floor && minY <= g.hoverMax) return;
    sink.add('warning', 'HOVER_BAND',
      `tagged hover but its lowest point is at y = ${f(minY)} (expected ${cat === 'pickup' ? g.pickupMinClearance : 0} to ${g.hoverMax})`,
      minY < floor
        ? (cat === 'pickup' ? 'Pickups hover: centre the model around y = 0.5 so its lowest point clears the floor.' : `Raise every part by ${f(-minY)}: a hovering model may not dip below the floor.`)
        : 'Lower the model: it floats out of the band where actors live.');
  } else if (cat === 'room') {
    if (minY > g.tol) {
      sink.add('error', 'NOT_GROUNDED', `the room's lowest point is at y = ${f(minY)}: there is no floor at y = 0`,
        'Give the room a floor strip whose top face is at y = 0 (it may extend below).');
    }
  } else if (Math.abs(minY) > g.tol) {
    sink.add('error', 'NOT_GROUNDED',
      minY > 0 ? `floats ${f(minY)} above the floor (lowest point y = ${f(minY)})` : `sinks ${f(-minY)} below the floor (lowest point y = ${f(minY)})`,
      `Shift every part's pos.y by ${f(-minY)} so the lowest point is at y = 0, or tag the model 'hover' (floats) or 'wall' (wall-mounted) if that is what it is.`);
  }
}

/** Art-bible size ranges per category. */
function checkSize(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const [w, h] = bounds.size;
  const cat = spec.category;
  const s = rules.sizes;
  const range = (label: string, value: number, [lo, hi]: [number, number]): void => {
    if (value >= lo * (1 - s.tolerance) && value <= hi * (1 + s.tolerance)) return;
    const want = lo === hi ? `${lo}` : `${lo} to ${hi}`;
    sink.add('warning', 'SIZE_RANGE', `${label} is ${f(value, 2)}, the art bible asks for ${want}`,
      `Scale the model by about ${f(Math.min(hi, Math.max(lo, value)) / value, 2)} (multiply part sizes and positions), keeping feet at y = 0.`);
  };
  if (spec.id === 'vibecoder.dev') range('height', h, s.vibecoderDevHeight);
  else if (cat === 'malware' || cat === 'agent') range('larger of width and height', Math.max(w, h), s.malwareMajor);
  else if (cat === 'boss') range('height', h, s.bossHeight);
  else if (cat === 'pickup') range('larger of width and height', Math.max(w, h), s.pickupMajor);
  else if (cat === 'door') { range('height', h, s.doorHeight); range('width', w, s.doorWidth); }
}

/** The camera never sees depth: keep it shallow. */
function checkDepth(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  const [w, h, d] = bounds.size;
  if (spec.category === 'room') {
    if (d > rules.depth.roomMaxDepth) {
      sink.add('warning', 'TOO_DEEP', `the room is ${f(d, 2)} deep (limit ${rules.depth.roomMaxDepth})`,
        'A room is a shallow stage. Pull props toward the back wall and thin the floor strip.');
    }
    return;
  }
  const limit = rules.depth.maxRatio * Math.max(w, h);
  if (d > limit + 1e-3) {
    sink.add('warning', 'TOO_DEEP',
      `depth ${f(d, 2)} is ${Math.round((d / Math.max(w, h)) * 100)}% of the larger of width and height (limit ${Math.round(rules.depth.maxRatio * 100)}% = ${f(limit, 2)})`,
      'The camera never sees depth. Thin the deepest parts (extrude depth, box size z) or pull parts that stick out in z back toward z = 0.');
  }
}

/** Grounding, size, depth: everything that only needs the bounds. */
export function checkModelBounds(spec: ModelSpec, bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink): void {
  if (spec.category === 'fx') return;
  checkGrounding(spec, bounds, rules, sink);
  checkSize(spec, bounds, rules, sink);
  checkDepth(spec, bounds, rules, sink);
}
