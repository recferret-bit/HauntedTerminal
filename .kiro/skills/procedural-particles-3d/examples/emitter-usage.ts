/**
 * How a stage plays FX presets. This is a recipe, not game code: `ComicStage`
 * (src/renderer/comic-stage.ts) does not use these presets yet. It shows the whole contract:
 * pick a preset by moment, place it, step it, feed it the flash, apply shake, dispose it.
 */
import * as THREE from 'three';
import { FxCatalog, createFxEmitter, type FxEmitter, type FxMoment } from '../../../../src/procgen/index.js';

export interface FxHost {
  /** The group effects are added to. In ComicStage this is the private `fx` group, drawn over actors. */
  layer: THREE.Group;
  /** ComicStage.triggerShake(mul). */
  shake(mul: number): void;
  /** Raise the room flash: LightningStrikeSystem.flashStrength / flashPos feed every comic material. */
  flash(strength: number, at: THREE.Vector3): void;
}

export class FxPlayer {
  private readonly live: FxEmitter[] = [];
  private plays = 0;

  constructor(private readonly host: FxHost) {}

  /**
   * `at` is the world position of the preset's anchor: an actor's `fx` socket for `center`,
   * its feet for `feet`, a door's `lock` socket for lock effects.
   * `text` replaces the word for this emission: play('pickup-ram', pos, `+${gb}GB`).
   */
  play(moment: FxMoment, at: THREE.Vector3, text?: string): FxEmitter | null {
    const preset = FxCatalog.forMoment(moment);
    if (!preset) return null;
    // A different seed per play, so two hops in a row are not the same drawing. Still deterministic.
    const fx = createFxEmitter(preset, { seed: ++this.plays, text });
    fx.group.position.copy(at);
    // Actors stand at z = 0.22 and the camera is on -z: pull the effect toward the camera.
    fx.group.position.z = at.z - 0.5;
    this.host.layer.add(fx.group);
    this.live.push(fx);
    if (preset.shake) this.host.shake(preset.shake);
    if (preset.flash) this.host.flash(preset.flash, at);
    return fx;
  }

  /** Call once per frame with the frame time in milliseconds. */
  update(dtMs: number, flashStrength: number, flashPos: THREE.Vector3): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i]!;
      fx.update(dtMs);
      // Effect chunks are lit by the lightning flash like everything else on the page.
      for (const mat of fx.materials) {
        mat.uniforms.uFlash!.value = flashStrength;
        (mat.uniforms.uFlashPos!.value as THREE.Vector3).copy(flashPos);
      }
      if (fx.done) {
        fx.dispose(); // removes the group from its parent and frees geometry and materials
        this.live.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.live.forEach((fx) => fx.dispose());
    this.live.length = 0;
  }
}

/**
 * Where the calls go in ComicStage.handleEvent, next to the existing say() / triggerShake() lines:
 *
 *   case 'PERMISSION_DENIED_RATTLE': fxPlayer.play('permission-denied', gate.position.clone().setY(gate.position.y + 0.9));
 *   case 'PROC_SIGNALED':
 *     KILLED          -> fxPlayer.play('sigkill', bossCentre)
 *     FROZEN          -> fxPlayer.play('sigstop-ice', bossCentre)
 *     TRAPPED_ENRAGED -> fxPlayer.play('sigterm-rage', bossCentre)
 *   case 'PLAYER_DAMAGED': fxPlayer.play('hit-hero', heroCentre, `-${ev.amount}HP`)
 *
 * A mirrored effect (fx.mv-dust for an object pushed toward screen-left): fx.group.scale.x = -1.
 * Scrubbing in the asset lab: fx.seek(tMs) draws any moment directly; the simulation is closed form.
 */
