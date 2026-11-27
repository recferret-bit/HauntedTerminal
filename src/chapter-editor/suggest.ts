import { FxCatalog, ModelCatalog } from '../procgen/index.js';
import { MUSIC_IDS, SFX_IDS } from '../contracts/audio-cues.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { baseName } from '../game/tree.js';
import { ROOM_KINDS } from '../chapters/validate-pack.js';
import type { LevelSpec } from '../chapters/types.js';


/** Names that come from the game's catalogs, the same in every editor. `undefined` for names an editor answers from its own data. */
function catalogNames(name: string): string[] | undefined {
  switch (name) {
    case 'models':
      return ModelCatalog.list().map((m) => m.id).sort();
    case 'rooms':
      return ROOM_KINDS.map((k) => `room.${k}`);
    case 'fx':
      return FxCatalog.list().map((p) => p.id).sort();
    case 'cores':
      return [...KIRO_CORE_ORDER];
    case 'sfx':
      return [...SFX_IDS];
    case 'music':
      return [...MUSIC_IDS];
    default:
      return undefined;
  }
}

/** Names offered by the `suggest` datalists. Paths, sockets and enemies come from the level being edited. */
export function makeSuggest(currentLevel: () => LevelSpec | undefined): (name: string) => string[] {
  return (name) => {
    const level = currentLevel();
    switch (name) {
      case 'paths':
        return level?.files.map((f) => f.path) ?? [];
      case 'sockets':
        return level?.files.filter((f) => f.kind === 'socket').map((f) => baseName(f.path)) ?? [];
      case 'enemies':
        return level?.enemies.map((e) => e.id) ?? [];
      default:
        return catalogNames(name) ?? [];
    }
  };
}
