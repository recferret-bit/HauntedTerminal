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

## Decisions

- **A (user, 2026-11-25):** Internal events. Every game click and action publishes an event. SFX, music, and later analytics and damage subscribe to those events.
- **B (user, 2026-11-25):** An SFX orchestrator and a music orchestrator own playback.
- **C (user, 2026-11-25):** Every SFX file and every music file we have is used.
- **D (user, 2026-11-25):** Sound sources are configurable. Start with 10.
- **E (user, 2026-11-25):** Refactor the apps and the orchestrators onto this bus, and update the Kiro spec.

## Open questions

None.

## Out of scope

- A network analytics client.
- A new damage formula. The existing `PLAYER_DAMAGED` event is the hook.
- Replacing the battle orchestrator or the dialog orchestrator. They already produce kernel events; those events are published.
