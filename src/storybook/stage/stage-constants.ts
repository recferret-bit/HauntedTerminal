import { GAME_PPU } from '../domain/options.js';

/**
 * The game's camera numbers (src/renderer/comic-stage.ts). The lab keeps the convention and
 * re-centres on the subject: camera on −z, looking +z, level; world +x is screen-left.
 */
export const CAM_DISTANCE = 8;
export const CAM_NEAR = 0.05;
export const CAM_FAR = 40;
/** z the game parks actors at (`built.group.position.set(worldX, feetY, 0.22)`). */
export const ACTOR_Z = 0.22;
/** z of the game's backdrop plane. */
export const BACKDROP_Z = 1.7;
/** Lab stand-in for the lantern: `lanternRadius: 140` px in the game's config, at design scale. */
export const LANTERN_RADIUS = 140 / GAME_PPU;
/** `flash=1`: a strike peaks at 5.5 and decays in 0.4 s. This is the mid-decay value, where shapes still read. */
export const HELD_FLASH = 0.6;
export const PLINTH_COLOR = 0x3a2a28;
