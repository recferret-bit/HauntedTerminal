import { TextureCatalog } from '../core/catalog.js';
import { BACKDROP_TEXTURES } from './backdrops.js';
import { DECAL_TEXTURES } from './decals.js';
import { SURFACE_TEXTURES } from './surfaces.js';
import type { TexEntry } from './toolkit.js';

/**
 * Every shipped texture, registered in TextureCatalog on import (src/procgen/index.ts imports this file).
 * To add one: write a TexEntry next to its kind (surfaces / backdrops / decals), add it to that
 * file's list, then run `npm run procgen:textures` and look at the sheet.
 * Skill: .kiro/skills/procedural-texture-synthesis
 */
export const TEXTURE_ENTRIES: readonly TexEntry[] = [...SURFACE_TEXTURES, ...BACKDROP_TEXTURES, ...DECAL_TEXTURES];

for (const entry of TEXTURE_ENTRIES) {
  if (!TextureCatalog.has(entry.id)) TextureCatalog.register(entry);
}
