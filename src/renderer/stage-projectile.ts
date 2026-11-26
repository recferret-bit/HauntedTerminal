import * as THREE from 'three';
import { actorSocket, type StageActor } from './stage-cast.js';
import { ACTOR_Z } from './stage-const.js';
import { playFx } from './stage-fx.js';
import { stepped } from './tween.js';
import type { ComicStage } from './comic-stage.js';

const FLIGHT_MS = 250;
const HOLD_AFTER_IMPACT_MS = 220;
const ARC_HEIGHT = 0.34;

/**
 * Hurls a stepped red-Matrix fireball (`fx.enemy-fireball`) along a comic arc from the attacking
 * enemy's `fx` socket into the vibecoder's `fx` socket, landing on the 250 ms impact beat of
 * `fx.hit-vibecoder`. Skipped when `reducedMotion` is enabled.
 */
export function launchEnemyProjectile(stage: ComicStage, attacker: StageActor): void {
  if (stage.reducedMotion.on || attacker.disposed) return;
  const hero = stage.hero();
  if (!hero || hero.disposed) return;
  const start = actorSocket(attacker, 'fx');
  const end0 = actorSocket(hero, 'fx');
  const mirror = end0.x < start.x;
  const carrier = new THREE.Group();
  carrier.name = `projectile:${attacker.id}`;
  carrier.position.set(start.x, start.y, ACTOR_Z - 0.15);
  stage.world.add(carrier);
  playFx(stage, 'fx.enemy-fireball', carrier.position, { follow: carrier, mirror, noShake: true }, `proj:${attacker.id}`);
  stage.tweens.add(FLIGHT_MS, (t) => {
    const to = !hero.disposed ? actorSocket(hero, 'fx') : end0;
    const k = stepped(t, 5);
    const arc = Math.sin(k * Math.PI) * ARC_HEIGHT;
    carrier.position.set(
      start.x + (to.x - start.x) * k,
      start.y + (to.y - start.y) * k + arc,
      ACTOR_Z - 0.15,
    );
  }, () => {
    const to = !hero.disposed ? actorSocket(hero, 'fx') : end0;
    carrier.position.set(to.x, to.y, ACTOR_Z - 0.15);
    stage.tweens.delay(HOLD_AFTER_IMPACT_MS, () => {
      carrier.removeFromParent();
    });
  });
}
