# App events, SFX and music: design

Status: see requirements.md

## Shape

`src/contracts/app-bus.ts` is the bus (pure). Sessions and pages emit. `src/audio/` subscribes. It imports only `contracts/`, and it is three-free. The game and the chapter runtime publish kernel events at the session boundary (the methods that return a result). They do not decode audio.

`attachAudio(bus, { sources })` builds one `AudioContext` when the browser has one. The default `sources` is `SOUND_SOURCES` (10): that many simultaneous one-shot voices. The oldest voice is stopped when an eleventh one-shot starts. Music uses two extra bed slots for the crossfade. Loop beds (`rain_loop`, `low_hp_loop`, `lap_fan`) use their own slots. Those extra slots are why a heartbeat is not cut off by typing. Passing `{ sources: N }` changes the one-shot pool.

Headless node has no `AudioContext`. The orchestrators still subscribe. Playback is a no-op. Events stay on the bus (`recent()`, capped).

Mute and volume stay on the session (`setMuted`, `setVolume`) and on the Esc menu. The session's existing `Sfx` object forwards them to the graph through `bind`. The oscillator cues are gone.

## Events

- `kernel`: one kernel event, published once per returned batch.
- `key`: `press`, `enter`, `backspace`, `tab` from the terminal.
- `command`: `ok`, `fail`, or `locked` (a chapter `script.locks` refusal).
- `pointer`: a click, `{ surface, id }`. Pages bind one listener. Unmapped clicks stay on the bus for a later analytics subscriber and play nothing.
- `menu`: Esc menu `open`, `close`, `move` (the volume slider and the confirm steps).
- `restart`: `arm` or `go`.
- `manual`: the in-game book opened or closed.
- `timer`: the battle clock's displayed second, played for 5 down to 1.
- `dialog`: emitted from `DialogOrchestrator.onOpen` (`{ speaker }`) when a dialog box visually opens on screen so Big Four voice taunts (`taunt_<agent>_{1..10}`), Kiro praise/cheer anti-taunts (`kiro_advice`, `kiro_advice_{2..10}` — randomly picked per speaker with prewarmed buffers and trimmed leading silence), and hero cues play in exact sync with box appearance rather than queue push. Later change 2026-11-26: speaker `dad` maps to `dad_cheer` (`SPEAKER_CUES` in `src/audio/sfx-kernel.ts`), variants `dad_cheer`, `dad_cheer_2` .. `dad_cheer_10` in `TAUNT_VARIANTS` (`src/audio/engine.ts`).
- `scene`: the music scene below.
- `laptop`: laptop lab actions (`open`, `close`, `post`, `disk`, `ready`, `trackpad`, `run`, `loop-guard`, `shutdown`, `key`).
- `loop`: start or stop `rain_loop`, `low_hp_loop`, `lap_fan`, `dad_typing_loop` or `dad_smoke_loop`.
- `cine` and `letter`: cinematic beats and lettering.
- `page`: the comic reader turned a page.
- `audio-hold`: the cinematic paused or resumed. The graph suspends.

## Music priority

First match wins. The Esc menu does not pause the clock or the turn timer (glossary). It only swaps the bed.

1. Surface `rank` -> `rank_card` (does not loop).
2. Esc menu open -> `menu_bed`.
3. Field manual open -> `manual_bed`.
4. Any surface other than `play`: `title_theme`, `level_select`, `manual_bed`, `achievements_bed`, `comic_reader`, `laptop_bed`, `lab_bed`, `cine_intro`, `cine_outro`.
5. A battle while HP is at or under 30% of max (the HUD low-HP mark) -> `low_hp_bed`. It replaces the battle bed. It does not layer.
6. A boss battle (`mechanic: boss`, or a live `boss.kernel` / `boss.forkbomb`) -> `battle_boss`.
7. Any other battle -> `battle_loop`.
8. A hub level -> `hub_matrix`.
9. Otherwise the floor theme: 1 `floor_attic`, 2 `floor_crypt`, 3 `floor_maze`, 4 `floor_furnace`, 5 `floor_core`.

Holding the laptop, outside a battle, uses `laptop_bed`. A lab session uses `lab_bed` and not a floor bed. Theme and hub come from the level spec (`floorTheme`, `mechanic`), not from a level index.

Low HP outside a battle starts `low_hp_loop` under the floor bed. Inside a battle the bed swap replaces that loop.

## SFX

`sfxFor` is a pure table from an app event to sample ids. Directory basenames from the room layouts pick the door samples (`door_usb`, `door_ethernet`, `door_hdmi`, `door_serial`, `door_firewall`, `door_loopback`, `door_null`). Enemy model ids pick `atk_*`, `boss_forkbomb` and `boss_kernel_panic`. The harness reads both manifests and fails if a name is missing from `src/audio/` outside the id list.

Cinematic lettering and beats emit `letter` and `cine` events on the shared bus. The procedural cinematic synth is retired. A muted or frozen cinematic passes no bus, so it stays silent.

## Files

- `src/contracts/app-bus.ts` bus, event union, music scene.
- `src/audio/limits.ts` `SOUND_SOURCES`.
- `src/audio/catalog.ts` ids, copied from the manifests and checked against them.
- `src/audio/voices.ts` oldest-voice pick.
- `src/audio/engine.ts` context, pool, beds, loops.
- `src/audio/sfx-for.ts`, `sfx-kernel.ts`, `sfx-app.ts`, `sfx-doors.ts`, `sfx-models.ts` the map.
- `src/audio/music-for.ts` scene priority.
- `src/audio/orchestrators.ts` both subscribers.
- `src/audio/attach.ts`, `page.ts` wiring helpers.
- `src/play/audio-sync.ts` play-page scene, timer, menu and manual edges.
- `scripts/harness/audio-unit.mjs` the gate.

Layers: `audio/` may import `contracts/` only. `play/`, `pages/`, `hub/`, `laptop/`, `terminal-lab/`, and `audio-lab/` may import `audio/`. `sound-designer` owns `src/audio/**` and `src/audio-lab/**`.
- Ambient loops (requirement 10): `syncPlayAudio` (`src/play/audio-sync.ts`) keeps the set of ambient `LoopCue`s of the hero's room (`ambientLoopsFor(room actor models)`, `src/audio/sfx-models.ts`) and publishes `loop` on/off for the difference on every sync; the set is kept per `Play` and reset by `mountPlayAudio`. `startLoop` in `src/audio/engine.ts` reads the per-cue gain from `LOOP_GAINS`.

