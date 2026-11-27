import { isMusicId } from '../contracts/audio-cues.js';
import type { MusicScene, MusicSurface } from '../contracts/app-bus.js';
import type { MusicId } from './catalog.js';

const SURFACE_BED: Partial<Record<MusicSurface, MusicId>> = {
  title: 'title_theme',
  'level-select': 'level_select',
  manual: 'manual_bed',
  achievements: 'achievements_bed',
  comic: 'comic_reader',
  laptop: 'laptop_bed',
  lab: 'lab_bed',
  'cine-intro': 'cine_intro',
  'cine-outro': 'cine_outro',
};

const FLOOR_BED: Record<1 | 2 | 3 | 4 | 5, MusicId> = {
  1: 'floor_attic',
  2: 'floor_crypt',
  3: 'floor_maze',
  4: 'floor_furnace',
  5: 'floor_core',
};

export function sceneFor(surface: MusicSurface, patch: Partial<MusicScene> = {}): MusicScene {
  return {
    surface,
    menu: false,
    reading: false,
    battle: 'none',
    lowHp: false,
    floorTheme: null,
    hub: false,
    ...patch,
  };
}

/** The one bed for this scene, or null when the page stays quiet. */
export function musicFor(scene: MusicScene): MusicId | null {
  if (scene.surface === 'rank') return 'rank_card';
  if (scene.menu) return 'menu_bed';
  if (scene.reading) return 'manual_bed';
  if (scene.surface !== 'play') {
    if (scene.music && isMusicId(scene.music)) return scene.music;
    return SURFACE_BED[scene.surface] ?? null;
  }
  if (scene.battle !== 'none' && scene.lowHp) return 'low_hp_bed';
  if (scene.battle === 'boss') return scene.music && isMusicId(scene.music) && scene.music.startsWith('battle_') ? scene.music : 'battle_boss';
  if (scene.battle === 'fight') return scene.music && isMusicId(scene.music) && scene.music.startsWith('battle_') ? scene.music : 'battle_loop';
  if (scene.music && isMusicId(scene.music)) return scene.music;
  if (scene.hub) return 'hub_matrix';
  if (scene.floorTheme === null) return null;
  return FLOOR_BED[scene.floorTheme];
}
