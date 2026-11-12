/**
 * Procedural visuals for Haunted Terminal: models and textures as plain data, built into
 * comic-shaded Three.js objects for the game and into PNG previews for the harness.
 * Start with .kiro/skills/haunted-art-direction/SKILL.md.
 */
export * from './core/rng.js';
export * from './core/palette.js';
export * from './core/types.js';
export * from './core/catalog.js';
export * from './core/pixels.js';
export * from './geometry/geometry.js';
export * from './geometry/raster.js';

export * from './kit/greebles.js';
export * from './validate/model.js';
export * from './validate/textures.js';
export * from './anim/index.js';
export * from './fx/index.js';
export * from './runtime/index.js';

// Importing these registers their entries in ModelCatalog / TextureCatalog.
import './textures/index.js';
import './archetypes/vibecoder.js';
import './archetypes/npc.js';
import './archetypes/agents.js';
import './archetypes/pickups.js';
import './archetypes/doors.js';
import './archetypes/props.js';
import './archetypes/malware.js';
import './archetypes/rooms.js';
import './archetypes/cinematic.js';
