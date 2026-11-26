# App events, SFX and music

Status: done

Capability: one internal app bus. Every game action and click publishes an event. An SFX orchestrator and a music orchestrator subscribe and play the samples in `public/sfx` and `public/music`. The same bus is what analytics, and any later damage presenter, will subscribe to. New code lives in `src/audio/`.

## Requirements

1. WHEN a session produces kernel events, THE SYSTEM SHALL publish each one on that session's app bus, once.
2. WHEN the player presses a key in the terminal, clicks a control, opens or closes the Esc menu, arms or confirms a level restart, opens or closes the field manual, or changes the battle turn timer's displayed second, THE SYSTEM SHALL publish an app event for that action.
3. WHEN a page outside the play session is showing (home, level select, field manual, achievements, comic reader, laptop lab), THE SYSTEM SHALL publish pointer events for clicks on that page and a scene event for the page's music.
4. THE SYSTEM SHALL play every sample named in `public/sfx/manifest.json` from at least one app event, and every cue named in `public/music/manifest.json` from at least one scene.
5. THE SYSTEM SHALL keep the one-shot voice pool configurable. The default size is 10 (`SOUND_SOURCES`). A full pool SHALL reuse the oldest voice.
6. WHILE a music scene is current, THE SYSTEM SHALL play at most one music bed, chosen by the scene priority in the design. A scene change SHALL crossfade. The Esc menu bed SHALL NOT pause the game clock or the battle turn timer.
7. WHEN the session mute or volume changes, THE SYSTEM SHALL apply it to the sample graph at once. Headless runs SHALL publish events and SHALL NOT require an audio device.
8. THE SYSTEM SHALL NOT send analytics, and SHALL NOT change how damage is calculated. `PLAYER_DAMAGED` on the bus is the event a later presenter subscribes to.
9. WHEN a dialog box visually opens on the play screen (`DialogOrchestrator` `onOpen`), THE SYSTEM SHALL publish one `dialog` app event `{ speaker }` and play that speaker's voice line from it: for `antigravy`, `codec`, `gork` and `clod` one of `taunt_<agent>_1` .. `taunt_<agent>_10`; for `kiro`, and for any speaker without a mapping, one of `kiro_advice`, `kiro_advice_2` .. `kiro_advice_10`; for `vibecoder` `dialog_hero`. THE SYSTEM SHALL pick the taunt or cheer variant at random and SHALL NOT pick the same variant twice in a row for that speaker. A new voice line SHALL fade out the voice line still playing. The `DIALOG_BOX` and `AGENT_TAUNT` kernel events SHALL play no voice line themselves, so the voice starts with the box and not when the line is queued. *(from code, commit a98ab95: `src/audio/sfx-kernel.ts` `SPEAKER_CUES` / `speakerCue`, `src/audio/engine.ts` `TAUNT_VARIANTS` / `nextPlayStyle`, `src/audio/orchestrators.ts`, `src/play/input.ts` `onDialogOpen`)* *(Later change 2026-11-26 (user: "generate 10 friendly cheers ... for old coder"): the old coder (`dad`, dad.tty) no longer plays `socket_crackle` but one of `dad_cheer`, `dad_cheer_2` .. `dad_cheer_10` (voice `Bill`, row 146 of `docs/audio/SFX_LIST.md`; `Bill` is outside the five voices the pipeline lists because all five are taken, see Decision G, approved by the user 2026-11-26), picked at random without an immediate repeat and fading the voice line still playing; `socket_crackle` stays the cue of `OBSTACLE_DIALOGUE_RENDERED`.)*
10. WHILE an NPC whose model has an ambient loop (`AMBIENT_LOOPS_BY_MODEL` in `src/audio/sfx-models.ts`: `npc.greybeard_rig` has `dad_typing_loop` and `dad_smoke_loop`) is in the hero's room on the play surface, THE SYSTEM SHALL publish a `loop` app event `{ cue, on: true }` for each of its loops (a loop with several takes, `dad_smoke_loop` and `_2` .. `_10`, plays them one after another at random, never the same take twice in a row), and `{ cue, on: false }` when he leaves the room, the NPC is gone, the level changes or the surface is not the play surface (`syncPlayAudio` in `src/play/audio-sync.ts`). The loops sit under the music and the voices (`dad_typing_loop` gain 0.16, `dad_smoke_loop` gain 0.14) and obey the pause hold like `rain_loop`. *(Added 2026-11-26, user: "i need a new sfx for the old guy typing a keyboard, and for smoking a cigarette".)*

## Decisions

- **A (user, 2026-11-25):** Internal events. Every game click and action publishes an event. SFX, music, and later analytics and damage subscribe to those events.
- **B (user, 2026-11-25):** An SFX orchestrator and a music orchestrator own playback.
- **C (user, 2026-11-25):** Every SFX file and every music file we have is used.
- **D (user, 2026-11-25):** Sound sources are configurable. Start with 10.
- **E (user, 2026-11-25):** Refactor the apps and the orchestrators onto this bus, and update the Kiro spec.
- **F (from commit a98ab95; user to confirm):** Each of the Big Four agents has 10 random robot taunt voice lines and Kiro has 10 cheers; the line plays when its dialog box opens (requirement 9).
- **G (user, 2026-11-26, "generate 10 friendly cheers ... for old coder"; voice choice by `sound-designer`, approved by the user 2026-11-26):** ten `dad_cheer*` voice lines for dad.tty in the voice `Bill` (warm, mature male, `robot` filter), not `George`, because George is Clod's voice and the other four listed voices are taken. If the user prefers a listed voice, the ten takes are regenerated.
- **H (user, 2026-11-26, "i approve all" for the ten `dad_cheer*` cues and voice `Bill`; then "i need a new sfx for the old guy typing a keyboard, and for smoking a cigarette"):** two ambience loops for the old coder, `dad_typing_loop` (8 s, SFX_LIST row 147) and `dad_smoke_loop` (12 s, row 148), `LoopCue` members, played while his rig is in the hero's room. The trigger (room presence), the gains and the model table were chosen by `lead-dev` and `sound-designer`; the user has not heard them yet. Decision G (voice `Bill`) is confirmed by the same approval.

## Open questions

None.

## Out of scope

- A network analytics client.
- A new damage formula. The existing `PLAYER_DAMAGED` event is the hook.
- Replacing the battle orchestrator or the dialog orchestrator. They already produce kernel events; those events are published.
- **I (user, 2026-11-26, "rework dad typing loop, need some typing on the beginning, loopable. dad smoke is sucks still, give me 10 new variants. is sounds like static errors"):** `dad_typing_loop` is retaken so typing starts at 0 s and ends mid-typing (the loop joins typing to typing). `dad_smoke_loop` is retaken three times (a human take, an airflow take, then a physical "paper tube draw and soft exhale" take, 5 s, prompt without hiss, noise or onomatopoeia); ten takes `dad_smoke_loop` and `_2` .. `_10` are audition candidates in `public/sfx/` and the catalog. The game plays `dad_smoke_loop` only; the user picks one and the others are removed. Row 148 and its manifest entries follow the row length (the wrapper refreshes them on a retake).
- **J (user, 2026-11-26, "apply all this sounds"):** all ten `dad_smoke_loop` takes ship. The smoke loop is a playlist (`LOOP_TAKES` in `src/audio/loop-takes.ts`): one take plays once, then a different random take, never the same twice in a row, until the loop is turned off. `dad_typing_loop` stays one seamless loop. Takes 2 to 10 were deleted from disk by something outside the session before they were committed and were regenerated from the unchanged row 148 prompt, so they are not the files the user first heard.
