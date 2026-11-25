import * as THREE from 'three';

/** Quintic smootherstep: zero speed and zero acceleration at both ends, so a flight lifts off and lands without a jolt. */
export const smootherstep = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * k * (k * (k * 6 - 15) + 10);
};

/**
 * The route of a flight: a centripetal Catmull-Rom spline through six waypoints, so it is a smooth curve
 * with no corners. It winds like an S: a rise that swings back first, a dive past the middle, a soar that
 * leans back over the target, then a settling descent onto it. Longer runs wind wider; short hops stay low.
 */
export function flightPath(from: THREE.Vector3, to: THREE.Vector3): THREE.CatmullRomCurve3 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dir = Math.sign(dx) || 1;
  const run = Math.hypot(dx, dy);
  const lift = Math.min(1.3, 0.25 + run * 0.3);
  const low = Math.min(from.y, to.y);
  const at = (f: number, sway: number, y: number): THREE.Vector3 =>
    new THREE.Vector3(from.x + dx * f + dir * sway * lift, y, from.z + (to.z - from.z) * f);
  return new THREE.CatmullRomCurve3([
    from.clone(),
    at(0.2, -0.3, from.y + lift * 0.8),
    at(0.45, 0.2, low - lift * 0.2),
    at(0.75, -0.15, to.y + lift * 0.55),
    at(0.92, 0, to.y + lift * 0.12),
    to.clone(),
  ], false, 'centripetal');
}
