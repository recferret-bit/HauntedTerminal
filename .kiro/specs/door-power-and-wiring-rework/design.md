# Door power and wiring rework: design

Status: see requirements.md

## Pieces

- `src/procgen/archetypes/doors.ts`: Add recessed emissive `cavity.glow` plates (`outline: false`), side solder lugs (`lug.l`, `lug.r`), and secondary stepped telemetry LEDs (`tx.led`, `rx.led`, `act.led`, `sync.led`, `status.led`, `post.*.led`, `rail.*.led`) to `door.usb`, `door.ethernet`, `door.hdmi`, `door.serial`, `door.firewall`, `door.loopback`, and `door.socket`, keeping `door.devnull` unchanged and all `MODEL_RULES` budgets/thresholds green.
- `src/contracts/room-view.ts`: Add optional `locked?: boolean` to `RoomActor` so Classic and Chapter rooms communicate exact lock status for both doors and gated `*.sock` actors without relying on label heuristics or the 4-entry `neighbors` cap.
- `src/game/runtime.ts`, `src/chapters/session-snapshot.ts`, `src/game/view.ts`: Compute accurate `open` status for gated `*.sock` sockets (`socketOpen` in Classic/Lab, `chapterSocketOpen` in Chapter) and stamp `RoomActor.locked` (`true`/`false`) on doors and `door.socket` actors in `placeThings` / `door:entry`.
- `src/renderer/stage-overlay.ts`, `src/renderer/stage-overlay.css`: Render `.st-lock` as the crisp `tex.decal.rwx-lock` comic padlock icon alone, removing the `"LOCKED"` text banner.
- `src/renderer/stage-door-rig.ts`: New renderer helper owning:
  - Deterministic selection (`pickDoorCableVariant`) across 4 procedural cable rigs (`floor_trench`, `wall_conduit`, `ceiling_drop`, `mixed_harness`) routed inward from `panelLeft`/`panelRight` edges.
  - Per-actor attachment/cloning of `prop.door_cables` + cloned `doorOwn` materials on LEDs, `cavity.glow`, contacts, and wire `pulse.*` beads (`ensureDoorRig`, `disposeDoorRig`).
  - Firewall bar retraction (`setFirewallOpenProgress`) keeping the outer frame grounded at `y = 0` and `100%` opacity.
  - Frame-stepped 12 fps power visuals (`stepDoorPower`, `syncDoorPowerImmediate`): dead dark non-emissive hardware when locked; glowing `cavity.glow`, stepped multi-LED patterns, illuminated contacts, traveling current pulses, periodic micro-sparks (`fx.door-unlock` miniature burst with `noShake: true`, `flashMul: 0`), and soft exit-ready beacon beep (`kiro_crack_step` via `stage.audioBus`).
  - `activeDoorLights(stage)` returning combined warm `powerAmber` + signal `phosphor` `ComicFxLight` pairs for up to 2 unlocked power doors/sockets (`<= 4` reserved slots out of the 8-slot `MAX_COMIC_FX_LIGHTS` pool) so they stay lit even during lightning strikes in dark sectors.
- `src/renderer/stage-cast.ts`, `src/renderer/stage-actor.ts`, `src/renderer/stage-sync.ts`, `src/renderer/stage-motion.ts`, `src/renderer/stage-frame.ts`: Wire `viewLocked`, `doorRig`, `isPowerDoorActor` lock checking, grounded `openDoor`/`closeDoor` (removing legacy `key === 'gate'` lift and `35%` fade), unlock spark surge (`fx.door-unlock`), `stepDoorPower` after `stepActors`, and `activeDoorLights` into `mergeComicFxLights`.
- `src/audio/sfx-kernel.ts`, `scripts/harness/lib/social-game-sfx.mjs`: Emit `['gate_open', 'lap_run']` when `INODE_MODE_CHANGED` unlocks a gate (`0 -> 0o755`), pairing the lock release with an electronic 3-note power-up beep.
- `scripts/harness/architecture-unit.mjs`, `scripts/harness/audio-unit.mjs`: Unit tests covering `RoomActor.locked` (doors + gated sockets), 4 cable variants, dark locked state vs shining/pulsing/beeping unlocked state, `door.firewall` bar retraction, `reducedMotion` steadiness, and `INODE_MODE_CHANGED` beep cues.

## Decisions

- **Separate stage cable rigs (`stage-door-rig.ts`) vs baking cables into `doors.ts`.** `MODEL_RULES` enforces `doorWidth: [0.7, 1.1]`, `doorHeight: [1.4, 1.9]`, `|minY| <= 0.03`, and `maxParts: 40` on `category: 'door'`. Attaching `prop.door_cables` on `actor.body` inside `stage-door-rig.ts` lets cables extend cleanly to the floor, side walls, and ceiling while keeping every `ModelCatalog` door spec strictly valid.
- **Additive `ComicFxLight` shine pool for unlocked doors (`activeDoorLights`).** Because `door.right` sits ~6 units from the hero lantern, `StageLight`'s cool darkness crushes non-emissive edge doors to black in Sector 01/02. Expanding `MAX_COMIC_FX_LIGHTS` from 4 to 8 and reserving up to 4 door slots (`powerAmber` + `phosphor` per unlocked door) before allocating remaining slots to lightning/FX keeps both doors and lightning strikes lit simultaneously via existing comic shaders and halos.
- **`stepDoorPower` runs after `stepActors`.** `ModelAnimator` updates `uEmissive` on `blink`-tagged parts during `stepActors`; applying `stepDoorPower` immediately afterward guarantees locked doors stay completely unpowered and unlocked doors step on exact 12 fps multi-LED patterns.

## Layers and gates

- All edits stay inside existing layer boundaries in `scripts/quality/check-layers.mjs` (`procgen/`, `contracts/`, `game/`, `chapters/`, `renderer/`, `audio/`, `scripts/harness/`). No new `src/<area>/`, `pages/*.html`, or dependency additions.
- Asset hash changes in `npm run quality:fingerprint` are restricted strictly to the 7 reworked `door.*` models (`door.usb`, `door.ethernet`, `door.hdmi`, `door.serial`, `door.firewall`, `door.loopback`, `door.socket`).
