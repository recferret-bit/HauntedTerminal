import { attachAudio } from '../audio/attach.js';
import { sceneFor } from '../audio/music-for.js';
import { bindPointerEvents } from '../audio/page.js';
import { ambientLoopsFor, isBossModel } from '../audio/sfx-models.js';
import type { LoopCue, MusicScene, MusicSurface } from '../contracts/app-bus.js';
import type { ComixRole } from '../cinematic/spec-types.js';
import type { GameSnapshot } from '../game/types.js';
import type { Play } from './state.js';

interface Remembered { key: string; menu: boolean; reading: boolean; tick: number | null; held: boolean; ambient: readonly LoopCue[] }

const remembered = new WeakMap<Play, Remembered>();

function freshMemory(): Remembered {
  return { key: '', menu: false, reading: false, tick: null, held: false, ambient: [] };
}

function bossFight(snap: GameSnapshot): boolean {
  if (snap.bossLevel) return true;
  return snap.room.actors.some((actor) => actor.model !== undefined && isBossModel(actor.model));
}

function sceneOf(play: Play, snap: GameSnapshot): MusicScene {
  const fighting = snap.battle !== null;
  let surface: MusicSurface = 'play';
  if (snap.ended && snap.rank) surface = 'rank';
  else if (play.terminalLab) surface = 'lab';
  else if (!fighting && snap.inventory.held === 'laptop') surface = 'laptop';
  const max = snap.maxHp > 0 ? snap.maxHp : 1;
  return sceneFor(surface, {
    menu: play.menu?.isOpen() ?? false,
    reading: play.manualBook?.isOpen() ?? false,
    battle: !fighting ? 'none' : bossFight(snap) ? 'boss' : 'fight',
    lowHp: snap.hp > 0 && snap.hp / max <= 0.3,
    floorTheme: snap.floor,
    hub: snap.hub === true,
  });
}

/** Sample graph on the session bus, and a click listener for the play page. */
export function mountPlayAudio(play: Play): void {
  play.unmountAudio?.();
  play.unmountAudio = undefined;
  remembered.delete(play);
  const bus = play.session.bus;
  if (!bus) return;
  const audio = attachAudio(bus);
  play.session.sfx?.bind(audio);
  play.stage.audioBus = bus;
  const unbind = bindPointerEvents(document, bus, 'play');
  play.unmountAudio = () => {
    unbind();
    if (play.stage.audioBus === bus) play.stage.audioBus = null;
    audio.dispose();
  };
}

/** Publish a scene when it changes, plus menu, manual and turn-timer edges. */
export function syncPlayAudio(play: Play): void {
  const bus = play.session.bus;
  if (!bus) return;
  const mem = remembered.get(play) ?? freshMemory();
  const phase = play.lifecycle.phase();
  if (play.holdMusic || phase === 'boot' || phase === 'intro' || phase === 'outro') {
    mem.held = true;
    remembered.set(play, mem);
    return;
  }
  const snap = play.session.snapshot();
  const scene = sceneOf(play, snap);
  const key = JSON.stringify(scene);
  const resume = mem.held;
  mem.held = false;
  if (resume || mem.key !== key) {
    mem.key = key;
    bus.emit({ kind: 'scene', scene });
  }
  // Ambience of NPCs in the hero's room (the old coder's typing and cigarette): on while he is there, off when he leaves.
  const ambient = scene.surface === 'play' ? ambientLoopsFor(snap.room.actors.map((actor) => actor.model)) : [];
  for (const cue of mem.ambient) if (!ambient.includes(cue)) bus.emit({ kind: 'loop', cue, on: false });
  for (const cue of ambient) if (!mem.ambient.includes(cue)) bus.emit({ kind: 'loop', cue, on: true });
  mem.ambient = ambient;
  if (mem.menu !== scene.menu) {
    bus.emit({ kind: 'menu', action: scene.menu ? 'open' : 'close' });
    mem.menu = scene.menu;
  }
  if (mem.reading !== scene.reading) {
    bus.emit({ kind: 'manual', open: scene.reading });
    mem.reading = scene.reading;
  }
  const left = snap.battle?.secondsLeft ?? null;
  const shown = left === null ? null : Math.ceil(left);
  if (shown !== null && shown !== mem.tick && shown >= 1 && shown <= 5) {
    bus.emit({ kind: 'timer', secondsLeft: shown });
  }
  mem.tick = shown;
  remembered.set(play, mem);
}

const CINE_BED: Record<ComixRole, MusicSurface> = {
  opening: 'cine-intro',
  ending: 'cine-outro',
  interlude: 'comic',
  standalone: 'comic',
};

/** Hold the play bed, then let the comix play on the same bus. */
export function holdForComix(play: Play, role: ComixRole): void {
  const mem = remembered.get(play) ?? freshMemory();
  mem.held = true;
  remembered.set(play, mem);
  play.session.bus?.emit({ kind: 'scene', scene: sceneFor(CINE_BED[role]) });
}
