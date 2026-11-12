import { ZONES, type ZoneDef } from '../../core/palette.js';
import type { PartSpec } from '../../core/types.js';

/** Palette lookups shared by the model checks. */
export function modelZoneDef(id: string): ZoneDef | undefined {
  return (ZONES as Record<string, ZoneDef>)[id];
}

export function modelPartTranslucent(part: PartSpec): boolean {
  const z = modelZoneDef(part.zone);
  return !!z && (z.ghost === true || (z.opacity ?? 1) < 0.9);
}
