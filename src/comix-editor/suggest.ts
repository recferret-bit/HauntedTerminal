import { ZONE_IDS } from '../procgen/core/palette.js';
import { FxCatalog, ModelCatalog } from '../procgen/index.js';
import type { ComixPack } from '../cinematic/spec-types.js';

let cachedModels: string[] | null = null;
let cachedRooms: string[] | null = null;
let cachedFx: string[] | null = null;

function modelIds(): string[] {
  if (!cachedModels) cachedModels = ModelCatalog.list().map((e) => e.id).sort();
  return cachedModels;
}

function roomIds(): string[] {
  if (!cachedRooms) cachedRooms = ModelCatalog.list('room').map((e) => e.id).sort();
  return cachedRooms;
}

function fxIds(): string[] {
  if (!cachedFx) cachedFx = FxCatalog.list().map((e) => e.id).sort();
  return cachedFx;
}

export function suggestForComix(pack: ComixPack, pageId: string, name: string): string[] {
  const page = pack.pages.find((p) => p.id === pageId);
  switch (name) {
    case 'models':
      return modelIds();
    case 'rooms':
      return roomIds();
    case 'fx':
      return fxIds();
    case 'zones':
      return [...ZONE_IDS].sort();
    case 'actors':
      return pack.manifest.cast.map((a) => a.id);
    case 'points':
      return Object.keys(pack.manifest.stage.points ?? {});
    case 'fixtures':
      return (pack.manifest.stage.fixtures ?? []).map((f) => f.id);
    case 'panels':
      return pack.pages.flatMap((p) => p.panels.map((pn) => pn.id));
    case 'marks': {
      const cues = new Set<string>([
        ...Object.keys(pack.manifest.cues ?? {}),
        ...Object.keys(page?.cues ?? {}),
      ]);
      const base = [...cues].sort();
      return [...base, '+0.2', '+0.5', '+1.0'];
    }
    default:
      return [];
  }
}
