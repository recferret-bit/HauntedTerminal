import { isMusicId } from '../contracts/audio-cues.js';
import type { AppBus, AppEvent, MusicScene, MusicSurface } from '../contracts/app-bus.js';
import type { MusicId, SfxId } from './catalog.js';
import type { AudioGraph } from './engine.js';
import { musicFor } from './music-for.js';
import { hpBand, sfxFor } from './sfx-for.js';

/** SFX orchestrator and music orchestrator: one subscriber, two jobs, both on the app bus. */
export function attachOrchestrators(bus: AppBus, graph: AudioGraph): () => void {
  // Suppress redundant turn-end cues right after a command verdict until the batch microtask flushes:
  // failed/locked commands already played `cmd_fail`/`cmd_locked` (drop `emote_shock`);
  // successful commands already played `key_enter` + `cmd_ok` (drop `hero_type` keyboard flurry).
  let dropShock = false;
  let dropHeroType = false;
  let dropArmed = false;
  let lastScene: MusicScene | null = null;
  let lastSurface: MusicSurface | null = null;
  let musicOverride: MusicId | undefined;

  const armCommandFollowupDrop = (ok: boolean): void => {
    if (ok) dropHeroType = true;
    else dropShock = true;
    if (dropArmed) return;
    dropArmed = true;
    queueMicrotask(() => {
      dropShock = false;
      dropHeroType = false;
      dropArmed = false;
    });
  };

  const cuesFor = (event: AppEvent): SfxId[] => {
    if (event.kind === 'command') armCommandFollowupDrop(event.result === 'ok');
    // Dialog and agent taunt audio is triggered on visual box open (`dialog` app event), not queue push.
    if (event.kind === 'kernel' && (event.event.type === 'DIALOG_BOX' || event.event.type === 'AGENT_TAUNT')) {
      return [];
    }
    const cues = sfxFor(event);
    if (!dropShock && !dropHeroType) return cues;
    return cues.filter((cue) => !(dropShock && cue === 'emote_shock') && !(dropHeroType && cue === 'hero_type'));
  };

  const onEvent = (event: AppEvent): void => {
    if (event.kind === 'audio-hold') {
      graph.hold(event.paused);
      return;
    }
    if (event.kind === 'music') {
      if (event.cue === null) {
        musicOverride = undefined;
        if (lastScene) graph.bed(musicFor(lastScene));
      } else if (isMusicId(event.cue)) {
        musicOverride = event.cue;
        graph.bed(musicOverride);
      }
      return;
    }
    if (event.kind === 'scene') {
      if (lastSurface !== event.scene.surface) {
        musicOverride = undefined;
        lastSurface = event.scene.surface;
      }
      lastScene = event.scene;
      const bed = musicOverride ?? musicFor(event.scene);
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
  };

  return bus.subscribe(onEvent);
}
