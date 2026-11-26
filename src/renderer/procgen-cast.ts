import * as THREE from 'three';
import type { ComicMaterial } from '../shaders/comic-material.js';

export function stampMaterialBases(mats: Iterable<ComicMaterial>): void {
  for (const mat of mats) {
    mat.userData.baseHex = (mat.uniforms.uColor!.value as THREE.Color).getHex();
    mat.userData.baseOpacity = mat.uniforms.uOpacity!.value as number;
    mat.userData.baseEmissive = mat.uniforms.uEmissive!.value as number;
  }
}
import { buildModel, createAnimator, ModelCatalog, type BuiltModel, type ModelAnimator, type ZoneId } from '../procgen/index.js';

/**
 * The game's cast, built from the procgen catalog (src/procgen) instead of the hand-made meshes in
 * procedural-cast.ts. Same interface, so ComicStage drives it unchanged: one `BuiltActor` per RoomActor key.
 */
export interface BuiltActor {
  key: string;
  group: THREE.Group;
  /** Main material. `paint(actor, body base colour)` restores every material to its own colour. */
  body: ComicMaterial;
  /** Every comic material of the actor (body included). */
  all: ComicMaterial[];
  /** Kept for the old interface; always empty. */
  extras: ComicMaterial[];
  /** Emissive lantern bulb (hero) that the stage pulses when the lantern lights. */
  glow?: ComicMaterial;
  model: BuiltModel;
  animator: ModelAnimator;
}

export interface HauntedCast {
  vibecoder: BuiltActor;
  ghost: BuiltActor;
  crate: BuiltActor;
  socket: BuiltActor;
  gargoyle: BuiltActor;
  gate: BuiltActor;
  boss: BuiltActor;
  minion: BuiltActor;
  hole: BuiltActor;
  mirror: BuiltActor;
  scroll: BuiltActor;
}

export interface CastDef {
  model: string;
  kind: 'vibecoder' | 'enemy' | 'boss' | 'pickup' | 'door' | 'prop' | 'npc';
  body: ZoneId;
  glow?: ZoneId;
  /** Uniform scale so the actor matches the size the room layout was authored for. */
  scale?: number;
}

/** Which procgen model plays each legacy RoomActor key (the stage's dynamic cast reads this too). */
export const LEGACY_CAST: Record<keyof HauntedCast, CastDef> = {
  vibecoder: { model: 'vibecoder.dev', kind: 'vibecoder', body: 'hoodie', glow: 'lantern' },
  ghost: { model: 'malware.rootkit', kind: 'enemy', body: 'ghostViolet' },
  crate: { model: 'prop.tar', kind: 'prop', body: 'plastic' },
  socket: { model: 'door.socket', kind: 'npc', body: 'plastic' },
  gargoyle: { model: 'malware.trojan', kind: 'enemy', body: 'corruptMagenta' },
  gate: { model: 'door.firewall', kind: 'door', body: 'solder' },
  boss: { model: 'boss.forkbomb', kind: 'boss', body: 'corruptMagenta', scale: 0.8 },
  minion: { model: 'malware.zombie', kind: 'enemy', body: 'toxicGreen' },
  hole: { model: 'door.devnull', kind: 'door', body: 'solder' },
  mirror: { model: 'door.loopback', kind: 'door', body: 'pcb' },
  scroll: { model: 'prop.file', kind: 'prop', body: 'paper' },
};

/**
 * The System Hand. Origin at the palm with the pencil point about half a unit below it and the palm
 * facing the camera, as the stage's draw-in tween expects.
 */
export function buildSystemHand(): BuiltActor {
  const model = buildModel(ModelCatalog.build('vibecoder.hand', 1));
  const group = new THREE.Group();
  group.name = 'system_hand';
  model.group.position.y = -0.5;
  group.add(model.group);
  const all = model.allMaterials;
  stampMaterialBases(all);
  const animator = createAnimator(model);
  return { key: 'system_hand', group, body: all[0]!, all, extras: [], model, animator };
}
