/**
 * Runtime adapters: everything that turns procgen data into live Three.js objects (comic materials,
 * ink shells, albedo textures, animators, FX emitters). The only procgen layer that imports shaders.
 */
export * from './build.js';
export * from './data-texture.js';
export * from './animator/index.js';
export * from './fx-emitter/index.js';
