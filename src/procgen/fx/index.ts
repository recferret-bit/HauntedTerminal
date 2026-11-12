/**
 * Comic effects: presets as plain data, a pure simulator, a validator, a software preview and
 * and (in runtime/) a Three.js emitter. Start with .kiro/skills/procedural-particles-3d/SKILL.md.
 */
export * from './types.js';
export * from './shapes.js';
export * from './lettering.js';
export * from './catalog.js';
export * from './simulate.js';
export * from './validate.js';
export * from './preview.js';

// Importing this registers the shipped presets in FxCatalog.
import './presets.js';
