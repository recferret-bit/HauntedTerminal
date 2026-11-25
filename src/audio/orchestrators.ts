import type { AppBus, AppEvent } from '../contracts/app-bus.js';
import type { SfxId } from './catalog.js';
import type { AudioGraph } from './engine.js';
import { musicFor } from './music-for.js';
import { hpBand, sfxFor } from './sfx-for.js';

/**
 * A failed command already plays `cmd_fail`. The shock emote that follows is
 * three more key clicks, so it stays quiet until the turn's events have flushed.
 */
let dropShock = false;
let dropArmed = false;

function armShockDrop(): void {
  dropShock = true;
  if (dropArmed) return;
  dropArmed = true;
  queueMicrotask(() => {
    dropShock = false;
    dropArmed = false;
  });
}

function cuesFor(event: AppEvent): SfxId[] {
  if (event.kind === 'command' && event.result !== 'ok') armShockDrop();
  const cues = sfxFor(event);
  return dropShock ? cues.filter((cue) => cue !== 'emote_shock') : cues;
}

function onEvent(graph: AudioGraph, event: AppEvent): void {
  if (event.kind === 'audio-hold') {
    graph.hold(event.paused);
    return;
  }
  if (event.kind === 'scene') {
    const bed = musicFor(event.scene);
    graph.bed(bed);
    const under = event.scene.surface === 'play' && event.scene.lowHp && event.scene.battle === 'none';
    graph.loop('low_hp_loop', under);
    return;
  }
  if (event.kind === 'loop') {
    graph.loop(event.cue, event.on);
    return;
  }
  for (const cue of cuesFor(event)) graph.play(cue);
  if (event.kind === 'kernel' && event.event.type === 'PLAYER_DAMAGED' && event.event.amount > 0) {
    const before = hpBand(event.event.hpRemaining + event.event.amount);
    const after = hpBand(event.event.hpRemaining);
    if (after < before) graph.play('hp_tier_drop');
  }
}

/** SFX orchestrator and music orchestrator: one subscriber, two jobs, both on the app bus. */
export function attachOrchestrators(bus: AppBus, graph: AudioGraph): () => void {
  return bus.subscribe((event) => onEvent(graph, event));
}
