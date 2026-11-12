/**
 * Greebles: the hardware vocabulary of Haunted Terminal as reusable part groups.
 * Every greeble is a pure function `(options) => PartSpec[]`. Spread the result into a model's parts.
 *
 * Conventions shared by all of them:
 *   - `name` prefixes every part the greeble makes (`${name}.body`, `${name}.pins`, ...).
 *   - `pos` is where it is MOUNTED: x, y are the centre of the greeble, z is the surface it sits on.
 *     It rises toward the camera (−z) from there and is sunk a hair into the surface so it never floats.
 *   - Sizes are world units. Nothing important should be thinner than MIN_FEATURE (2 px in game).
 *   - Zones are options with sensible hardware defaults; a greeble never invents a colour.
 *
 * Catalog with pictures of use: .kiro/skills/procedural-kitbash-3d/references/greeble-catalog.md
 */
export * from './shapes.js';
export { GREEBLE_SINK, type GreebleBase } from './greeble-base.js';
export * from './greeble-contacts.js';
export * from './greeble-ports.js';
export * from './greeble-grilles.js';
export * from './greeble-wiring.js';
export * from './greeble-locks.js';
