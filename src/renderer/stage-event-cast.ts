import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import type { FxCue } from './event-fx.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { clearBubble, playCues, playFx, say } from './stage-fx.js';
import { claim, flashActor, heroAction, heroEmote, hopInPlace, owns, playHand, playSpawn, release } from './stage-motion.js';
import { anchorPoint, findByKey, firstOfKind } from './stage-resolve.js';
import { syncOverlays } from './stage-sync.js';
import { stepped } from './tween.js';
import type { CameoMood } from './stage-cameos.js';
import type { ComicStage } from './comic-stage.js';

export function handleCastEvent(stage: ComicStage, ev: KernelEvent, subject: StageActor | null, cues: FxCue[]): boolean {
  switch (ev.type) {
    case 'SYSTEM_HAND_SPAWN':
      onSystemHand(stage, ev, subject, cues);
      return true;
    case 'ENTITY_SPAWNED':
      onEntitySpawned(stage, ev);
      return true;
    case 'FILE_CREATED':
      onFileCreated(stage, ev, subject, cues);
      return true;
    case 'HUD_OVERLAY_TOGGLED':
      stage.xrayProcs = ev.processes.map((p) => ({ pid: p.pid, ppid: p.ppid, name: p.name, cpu: p.cpu }));
      stage.xrayOn = stage.xrayProcs.length > 0;
      syncOverlays(stage);
      return true;
    case 'OBSTACLE_DIALOGUE_RENDERED':
      onDialogue(stage, ev, subject);
      return true;
    case 'PUZZLE_DOOR_RESOLVED':
      // The unlocked door opens when the view drops its lock (syncOverlays).
      clearBubble(stage);
      return true;
    case 'VIBECODER_ACTION':
      onVibecoderAction(stage, ev);
      return true;
    case 'AGENT_TAUNT':
      onAgentTaunt(stage, ev);
      return true;
    case 'KIRO_ACTION':
      onKiroAction(stage, ev);
      return true;
    case 'TUTORIAL_STEP':
      onTutorial(stage, ev);
      return true;
    case 'VIBECODER_EMOTE':
      onEmote(stage, ev);
      return true;
    default:
      return false;
  }
}

function onSystemHand(stage: ComicStage, ev: Extract<KernelEvent, { type: 'SYSTEM_HAND_SPAWN' }>, subject: StageActor | null, cues: FxCue[]): void {
  // The kernel pairs this with ENTITY_SPAWNED for the same fork: the entity event draws the hand
  // (it knows which actor). Wait one step and stand down if it claimed this reason meanwhile.
  const at = stage.clockMs;
  if (stage.handClaims.get(ev.reason) === at) return;
  stage.tweens.add(16, () => {}, () => {
    if ((stage.handClaims.get(ev.reason) ?? -1) >= at) return;
    const target = subject && !subject.disposed ? subject : findByKey(stage, 'minion') ?? findByKey(stage, 'crate');
    const source = ev.reason === 'boss_fork' ? firstOfKind(stage, 'boss') : null;
    if (source && !source.exiting) source.animator.setState('attack');
    playHand(stage, target, target ? target.group.position.clone() : anchorPoint(stage, 'panel-floor', null), ev.reason, cues);
  });
}

function onEntitySpawned(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ENTITY_SPAWNED' }>): void {
  if (ev.reason === 'boss_fork' || ev.reason === 'cron_restore') stage.handClaims.set(ev.reason, stage.clockMs);
  const a = stage.actors.get(ev.entityId);
  if (a && !a.exiting) playSpawn(stage, a, ev.reason);
  else stage.pendingSpawn.set(ev.entityId, { reason: ev.reason, at: stage.clockMs });
}

function onFileCreated(stage: ComicStage, ev: Extract<KernelEvent, { type: 'FILE_CREATED' }>, subject: StageActor | null, cues: FxCue[]): void {
  const id = ev.entityId ?? subject?.id;
  const a = id ? stage.actors.get(id) : undefined;
  if (a && !a.exiting) playSpawn(stage, a, 'script');
  else if (id) stage.pendingSpawn.set(id, { reason: 'script', at: stage.clockMs });
  else playCues(stage, cues, null, ev);
}

function onDialogue(stage: ComicStage, ev: Extract<KernelEvent, { type: 'OBSTACLE_DIALOGUE_RENDERED' }>, subject: StageActor | null): void {
  clearBubble(stage);
  const speaker = subject ?? firstOfKind(stage, 'npc');
  const line = ev.payload?.pages?.[0]?.text ?? ev.payload?.speakerName ?? '...';
  const who = speaker;
  const anchor = () => (who && !who.disposed ? actorSocket(who, 'bubble').add(new THREE.Vector3(0, 0.25, 0)) : anchorPoint(stage, 'panel', null));
  stage.bubble = stage.overlay.balloon(String(ev.payload?.speakerName ?? '???'), String(line), String(ev.payload?.bubbleStyle ?? 'COMIX_CLASSIC'), anchor, Math.min(16000, Math.max(7000, 4000 + String(line).length * 55)));
}

function onVibecoderAction(stage: ComicStage, ev: Extract<KernelEvent, { type: 'VIBECODER_ACTION' }>): void {
  const hero = stage.hero();
  if (hero) heroAction(stage, hero, ev.action, ev.targetEntityId);
  // `ls` pings the room with the light; `ls -a` / `ls -la` pings harder and holds longer.
  const words = String(ev.command ?? '').trim().split(/[\s;|&]+/);
  const at = words.indexOf('ls');
  if (at >= 0) {
    const all = words.slice(at + 1).some((w) => /^-[a-zA-Z]*a/.test(w));
    stage.light.ping(all ? 2 : 1);
    stage.fidgetIn = Math.max(stage.fidgetIn, 3);
  }
}

function onAgentTaunt(stage: ComicStage, ev: Extract<KernelEvent, { type: 'AGENT_TAUNT' }>): void {
  const mood: CameoMood = ['laugh', 'order', 'smug', 'annoyed'].includes(ev.mood) ? ev.mood : 'smug';
  stage.cameos.enqueue({ agent: String(ev.agent), model: ev.model, text: String(ev.text ?? ''), mood });
}

function onKiroAction(stage: ComicStage, ev: Extract<KernelEvent, { type: 'KIRO_ACTION' }>): void {
  const kiro = stage.actors.get('kiro');
  if (ev.action === 'scan') kiroScan(stage, ev, kiro);
  else if (ev.action === 'load') kiroLoad(stage, ev, kiro);
  else if (ev.action === 'crack_start' || ev.action === 'crack_step') kiroCrack(stage, ev, kiro);
  else if (ev.action === 'crack_done') kiroCrackDone(stage, ev, kiro);
}

function kiroScan(stage: ComicStage, ev: Extract<KernelEvent, { type: 'KIRO_ACTION' }>, kiro: StageActor | undefined): void {
  stage.light.ping(2);
  const at = kiro && !kiro.disposed ? actorSocket(kiro, 'fx') : anchorPoint(stage, 'panel', null);
  say(stage, ev.message, at, '#4cc9f0', 0.9);
  if (!kiro || kiro.disposed) return;
  const g = claim(kiro);
  const startX = kiro.base.x;
  const sweepX = Math.max(stage.panelRight + 0.35, startX - 1.05);
  kiro.animator.setState('windup');
  flashActor(stage, kiro, 0x4cc9f0, 260, 0);
  stage.tweens.add(520, (t) => {
    if (!owns(kiro, g)) return;
    const k = stepped(t, 6);
    const arc = Math.sin(k * Math.PI);
    kiro.base.x = startX + (sweepX - startX) * arc;
    kiro.offset.y = arc * 0.18;
  }, () => {
    if (!owns(kiro, g)) return;
    kiro.offset.y = 0;
    release(kiro, g);
    setRest(kiro);
  });
}

function kiroLoad(stage: ComicStage, ev: Extract<KernelEvent, { type: 'KIRO_ACTION' }>, kiro: StageActor | undefined): void {
  const at = kiro && !kiro.disposed ? actorSocket(kiro, 'fx') : anchorPoint(stage, 'panel', null);
  say(stage, ev.message, at, '#ffd166', 0.9);
  if (kiro && !kiro.disposed) {
    hopInPlace(stage, kiro, 0.16, 280);
    flashActor(stage, kiro, 0x4cc9f0, 240, 0);
  }
}

function kiroCrack(stage: ComicStage, ev: Extract<KernelEvent, { type: 'KIRO_ACTION' }>, kiro: StageActor | undefined): void {
  const at = kiro && !kiro.disposed ? actorSocket(kiro, 'fx') : anchorPoint(stage, 'panel', null);
  say(stage, ev.message, at, '#4cc9f0', 0.9);
  if (kiro && !kiro.disposed) {
    kiro.animator.setState('windup');
    flashActor(stage, kiro, 0x4cc9f0, 200, 0);
  }
}

function kiroCrackDone(stage: ComicStage, ev: Extract<KernelEvent, { type: 'KIRO_ACTION' }>, kiro: StageActor | undefined): void {
  const at = kiro && !kiro.disposed ? actorSocket(kiro, 'fx') : anchorPoint(stage, 'panel', null);
  playFx(stage, 'fx.gate-open', at, {}, 'kiro-crack');
  say(stage, ev.message, at, '#39ff88', 1.05);
  if (kiro && !kiro.disposed) {
    hopInPlace(stage, kiro, 0.2, 300);
    flashActor(stage, kiro, 0x39ff88, 280, 0);
    setRest(kiro);
  }
}

function onTutorial(stage: ComicStage, ev: Extract<KernelEvent, { type: 'TUTORIAL_STEP' }>): void {
  if (ev.done) {
    // The DOM prompt card stamps DONE and the game follows with an AGENT_TAUNT (that is the
    // cameo for this beat), so the canvas only gives the hero a small hop of triumph.
    const h = stage.hero();
    if (h) hopInPlace(stage, h, 0.18, 260);
  } else {
    stage.cameos.enqueue({
      agent: String(ev.agent), text: String(ev.prompt ?? ''), mood: 'order', command: ev.command ? String(ev.command) : undefined,
      tag: Number.isFinite(ev.step) && Number.isFinite(ev.total) ? `PROMPT ${ev.step}/${ev.total}` : undefined,
    });
  }
}

function onEmote(stage: ComicStage, ev: Extract<KernelEvent, { type: 'VIBECODER_EMOTE' }>): void {
  const h = stage.hero();
  if (h) heroEmote(stage, h, ev.emote, ev.text);
}
