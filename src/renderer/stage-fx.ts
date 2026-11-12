import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import type { FxAnchor, FxCue } from './event-fx.js';
import type { FxId } from './fx-player.js';
import { playPageTear } from './stage-cards.js';
import type { StageActor } from './stage-cast.js';
import { reportStage } from './stage-actor.js';
import { anchorPoint } from './stage-resolve.js';
import type { ComicStage } from './comic-stage.js';

export function triggerShake(stage: ComicStage, mul: number): void {
  stage.shakeLeft = 280;
  stage.shakeAmp = stage.config.shakeIntensity * 0.006 * mul;
}

/** Dynamic lettering (dialogue, labels, words no preset carries). Rises and fades over 980 ms. */
export function say(stage: ComicStage, text: string, at: THREE.Vector3, color: string, dy: number, size = 1): void {
  stage.overlay.say(text, at, color, dy, size);
}

export function clearBubble(stage: ComicStage): void {
  stage.bubble?.drop();
  stage.bubble = null;
}

export function playFx(stage: ComicStage, id: FxId, at: THREE.Vector3, opts: { text?: string; scale?: number; noShake?: boolean; mirror?: boolean; flashMul?: number } = {}, key?: string): void {
  try {
    // Lettering must stay on the page: pull worded effects in from the panel edges.
    const preset = stage.fxPlayer.preset(id);
    let origin = at;
    if (preset?.onomatopoeia && !preset.fullPanel && opts.text?.trim() !== '') {
      const word = opts.text ?? preset.onomatopoeia.text;
      const half = Math.min(2.2, 0.25 + word.length * (preset.onomatopoeia.size ?? 0.3) * 0.36);
      origin = at.clone();
      origin.x = Math.min(stage.panelLeft - half, Math.max(stage.panelRight + half, origin.x));
    }
    stage.fxPlayer.play(id, origin, opts, key);
  } catch (err) {
    reportStage(stage, `fx ${id}`, err);
  }
}

export function playCues(stage: ComicStage, cues: FxCue[], subject: StageActor | null, ev: KernelEvent | null, at?: THREE.Vector3): void {
  const seen = new Set<string>();
  let who = subject;
  for (const c of cues) {
    const repeat = seen.has(c.id);
    seen.add(c.id);
    stage.tweens.delay(c.delayMs ?? 0, () => {
      if (who?.disposed && c.anchor.startsWith('subject')) who = null;
      // The event names an entity that is not on this panel (left, or a bogus id): no effect in mid-air,
      // except the pickup's reward, which still pops over the hero.
      let anchor: FxAnchor = c.anchor;
      if (!who && !at && (anchor.startsWith('subject') || anchor === 'hand')) {
        if (ev?.type !== 'PICKUP_COLLECTED') return;
        anchor = 'vibecoder';
      }
      const pos = at && (anchor === 'hand' || anchor.startsWith('subject')) && !who ? at.clone() : anchorPoint(stage, anchor, who);
      const mirror = c.id === 'fx.mv-dust' && who ? ((who as StageActor & { moveDir?: number }).moveDir ?? -1) > 0 : false;
      const key = who?.id ?? (ev ? ev.type : 'stage');
      playFx(stage, c.id, pos, { text: c.text, scale: c.scale, noShake: repeat, mirror }, key);
    });
  }
}

/** Page turn in 420 ms + hold + turn out 380 ms = 1600 ms, main.ts's CARD_MS pause. */
export function playCard(stage: ComicStage, kicker: string, title: string, path: string, accent: string, holdMs = 800): void {
  stage.cardKill?.();
  const card = stage.overlay.card(kicker, title, path, accent, 420, holdMs, 380);
  stage.cardKill = () => card.drop();
}

export function playTear(stage: ComicStage, text: string): void {
  // The torn page is art (canvas); its lettering is DOM.
  playPageTear(stage.pageLayer, stage.tweens, stage.panelBounds(), '');
  stage.overlay.tearText(text, 'KERNEL COREDUMP // TRY AGAIN', 200, 560);
}
