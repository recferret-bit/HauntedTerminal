import '../procgen/index.js';
import { ModelCatalog } from '../procgen/core/catalog.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { ROOM_KINDS } from '../chapters/validate-pack.js';
import type { LevelSpec } from '../chapters/types.js';

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Names offered by the `suggest` datalists. Paths, sockets and enemies come from the level being edited. */
export function makeSuggest(currentLevel: () => LevelSpec | undefined): (name: string) => string[] {
  return (name) => {
    const level = currentLevel();
    switch (name) {
      case 'models':
        return ModelCatalog.list().map((m) => m.id).sort();
      case 'rooms':
        return ROOM_KINDS.map((k) => `room.${k}`);
      case 'cores':
        return [...KIRO_CORE_ORDER];
      case 'paths':
        return level?.files.map((f) => f.path) ?? [];
      case 'sockets':
        return level?.files.filter((f) => f.kind === 'socket').map((f) => baseName(f.path)) ?? [];
      case 'enemies':
        return level?.enemies.map((e) => e.id) ?? [];
      default:
        return [];
    }
  };
}
