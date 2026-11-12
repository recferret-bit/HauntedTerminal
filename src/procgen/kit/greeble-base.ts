/** Shared mounting maths and the option base every greeble extends. */
import type { Vec3 } from '../core/types.js';

/** How far a greeble is pushed into the surface it is mounted on. */
export const GREEBLE_SINK = 0.008;

/** Centre z of a slab `depth` thick mounted on a surface at `z`. */
export function mount(z: number, depth: number): number {
  return z + GREEBLE_SINK - depth / 2;
}
/** Front face z of that slab: mount the next layer here. */
export function face(z: number, depth: number): number {
  return z + GREEBLE_SINK - depth;
}

export interface GreebleBase {
  /** Prefix for the part names. */
  name: string;
  /** Mount point: centre x, centre y, surface z. */
  pos: Vec3;
}
