# Door power and wiring rework: requirements

Status: done (2026-11-27)

Capability: Rework all interactive port/directory doors (`door.usb`, `door.ethernet`, `door.hdmi`, `door.serial`, `door.firewall`, `door.loopback`) and gated `door.socket` (`*.sock`) actors across Chapter, Classic, and Terminal Lab sessions so locked states look completely powered off with a clean comic padlock icon badge (no `"LOCKED"` text banner), while unlocked/open states remain grounded at 100% opacity (instead of floating/fading dark; only `door.firewall` iron bars lift) with illuminated inner port contacts/mouths, a dynamic comic light shine pool, stepped 12 fps multi-LED flashing, electronic unlock and exit-ready beeps, four seeded procedural cable-routing variations (floor trench, side-wall conduit, ceiling bus drop, mixed ribbon + power harness), and stepped 12 fps traveling wire current pulses, unlock spark surges, and periodic micro-sparks (user request 2026-11-27: "lets rework our current sockets/doors when locked and unlocked. make locked to be like not powered with a lock icon. but when opened > nut it becames just black, but i want it to leave, make indicators works and flash, add electricity from wires to sned sparks/pulses to make it obvious that it works. So i lets add different variations of wires and cables that attached to the doors, like from floor, from walls, etc."; follow-up 2026-11-27: "i asked to rework current end level doors, to make them shine and beep with wires and stuff, its still just plain black").

## What exists today (read from the code, 2026-11-27)

- `src/procgen/archetypes/doors.ts` & `src/procgen/kit/greeble-ports.ts`: `door.usb`, `door.ethernet`, `door.hdmi`, `door.serial`, `door.firewall`, `door.loopback`, `door.devnull`, and `door.socket` (`*.sock`). Port doors use dark `silicon` `port.cavity` mouths and a small `led` (`door.ethernet` also blinks `link.led` in `powerAmber` even while locked). `MODEL_RULES` (`src/procgen/validate/model/rules.ts`) constrains `category: 'door'` to `width [0.7, 1.1]`, `height [1.4, 1.9]`, `|minY| <= 0.03`, and `maxParts: 40`.
- `src/renderer/stage-motion.ts` (`openDoor` / `closeDoor`) & `src/game/view-layouts.ts`: Every exit gate with `key: 'gate'` (`door.ethernet` / `door.firewall`) sits at `door.right` far outside `StageLight`'s lantern radius (`2.7` normal, `1.15` dark), runs `door.offset.y = 0.7 * k` and `fade(door, 1 - 0.65 * t)` on unlock, lifting the port door off the floor and fading it to 35% dark opacity, while already-open doors sit in shadow with a flat dark `silicon` cavity and a static tiny green dot.
- `src/renderer/stage-sync.ts` (`tintDoorLed`, `syncOverlays`) & `src/renderer/stage-overlay.ts` (`.st-lock`): `tintDoorLed` only swaps `led` color (`lockRed` vs `phosphor`) without powering off secondary LEDs when locked or flashing indicators when unlocked; `.st-lock` shows `tex.decal.rwx-lock` + `"LOCKED"`; no floor/wall/ceiling cable variations, comic light shine pools, or wire current pulses/sparks are attached to doors.
- `src/game/view.ts`, `src/game/runtime.ts`, and `src/chapters/session-snapshot.ts`: `ViewThing.open` currently treats `socket` as always `true` (`open: child.kind === 'dir' ? (child.mode & 0o111) !== 0 : true`) even when a `*.sock` actor is gated by an unsolved riddle or boss verification token.
- `src/audio/sfx-kernel.ts`: `INODE_MODE_CHANGED` (`0 -> 0o755`) emits `gate_open` only, with no electronic power-up beep or ready exit beacon tick.

## Requirements

1. **Covered doors and sockets (`door.*` scope):**
   WHEN building and syncing room actors, THE SYSTEM SHALL apply the power, indicator, shine, and attached-wiring system to all port/directory doors (`door.usb`, `door.ethernet`, `door.hdmi`, `door.serial`, `door.firewall`, `door.loopback`) and gated riddle/verification `door.socket` (`*.sock`) actors across Chapter, Classic, and Terminal Lab sessions, WHILE keeping `/dev/null` (`door.devnull`) on its dedicated vortex visual and keeping non-gated talk/ally sockets powered without a lock icon.

2. **Unpowered locked state and clean padlock icon badge:**
   WHILE a covered door or gated `door.socket` is locked (unenterable directory/symlink, closed exit gate, or unsolved riddle/verification socket), THE SYSTEM SHALL render all of its status/link/eye LEDs, inner port cavity/contacts, and attached cable pulse segments in a completely powered-off, non-emissive dark hardware state with zero emitted `ComicFxLight`, AND SHALL display a clean comic padlock icon badge at its `lock` socket with no `"LOCKED"` text banner.

3. **Grounded, full-opacity live state when unlocked or already open:**
   WHEN a covered door or gated `door.socket` unlocks OR enters the stage already unlocked, THE SYSTEM SHALL keep the actor grounded at `y = 0` and `100%` opacity (removing the legacy `key === 'gate'` upward float and `35%` opacity fade on port doors; for `door.firewall`, retracting only its inner iron bars and hiding its padlock inside its grounded frame) and SHALL remove the padlock overlay badge.

4. **Energized inner port mouth/contacts, comic shine light, and stepped multi-LED flashing:**
   WHILE a covered door or `door.socket` is unlocked/powered, THE SYSTEM SHALL illuminate its inner port contacts/mouth (or socket grille/eyes) with palette-locked `signal` glow (`phosphor`, `dataCyan`, `powerAmber`), emit a stepped `ComicFxLight` (`StageLight.fxHalos` + `COMIC_FRAG` `comicFxLight`) centered at the door so open ports and end-level exit doors visibly shine even in dark rooms, and animate its status/activity LEDs with stepped 12 fps comic flashing so open ports read as active hardware rather than a black cavity.

5. **Four seeded procedural cable-routing variations:**
   WHEN a covered door or `door.socket` actor is staged, THE SYSTEM SHALL attach one of four deterministic procedural cable-rig variations — **floor trench conduit**, **side-wall conduit loom**, **ceiling bus drop**, or **mixed ribbon + power harness** — auto-selected from the room seed and door slot/position (routing inward inside the viewport edge) using hardware palette zones and comic ink shells, requiring zero manual per-level JSON edits.

6. **Traveling 12 fps wire current pulses, unlock spark surge, periodic micro-sparks, and electronic beeps:**
   WHILE a covered door or `door.socket` is powered, THE SYSTEM SHALL step emissive electrical pulses along its attached cables into the door on the 12 fps comic beat and emit gentle periodic comic micro-sparks (with `noShake: true`) at its cable lugs; WHEN an unlocked exit door (`portRole === 'exit'`) sits ready in live play (`!devNoStorm && !stormPaused && !reducedMotion.on && !overlay.dialogueOpen && !isLevelTransitioning()`), its telemetry beacon SHALL emit a soft digital tick-beep (`kiro_crack_step` via `stage.audioBus`); AND WHEN a covered door or `door.socket` transitions from locked to unlocked (`INODE_MODE_CHANGED` or view unlock), THE SYSTEM SHALL play an energized electric spark-surge burst (`fx.door-unlock`) at the door alongside the mechanical lock release + 3-note electronic power-up beep (`['gate_open', 'lap_run']`).

7. **Reduced-motion and audio hygiene:**
   WHILE `prefers-reduced-motion: reduce` (`stage.reducedMotion.on`) is active, THE SYSTEM SHALL render steady lit indicators, steady shine light, and powered wire accents on unlocked doors/sockets while suppressing continuous LED strobing, traveling wire pulses, periodic idle micro-sparks, and idle telemetry beeps; AND idle pulses/micro-sparks SHALL NOT add repetitive continuous audio loops.

8. **Validator, architecture, and playthrough gates:**
   THE SYSTEM SHALL satisfy `credits-art-direction` and `MODEL_RULES` (`validate-model.mjs --all --strict --seeds 8`, `validate-particles.mjs --all --strict`, `check-tags.mjs --all`), inward layer rules (`check-layers.mjs`), size/deadcode/clone gates (`npm run quality`), and 0-death headless chapter and classic playthroughs, with intended asset hash updates explained via `npm run quality:fingerprint`.

## Out of scope

- Reworking `/dev/null` (`door.devnull`) vortex visuals or non-gated ally character rigs (`npc.greybeard_rig`).
- `"LOCKED"` text banner under the padlock icon badge.
- Per-level or `/editor` JSON schema overrides for door cable variants (auto-seeded by room seed + door slot).
- Adding new ElevenLabs audio generation runs (reuses existing `gate_open`, `lap_run`, `kiro_crack_step`, and `puzzle_solved` cues).

## Decisions

- **Q1:** Which doors and sockets should get this power, indicator, and wiring rework?
  **A (user, 2026-11-27):** All port/directory doors + riddle `*.sock` sockets (keep `/dev/null` special) — unifies every interactive port door and socket gate while keeping `/dev/null`'s black-hole vortex distinct `(Recommended)`.
- **Q2:** When a door/socket is LOCKED (unpowered), how should its indicators and lock icon look?
  **A (user, 2026-11-27):** Completely powered-off dark LEDs/cavity + clean comic padlock icon badge (no `"LOCKED"` text banner) — reads unmistakably dead/unpowered without covering the door silhouette `(Recommended)`.
- **Q3:** When a door is UNLOCKED / OPENED, how should the door body and indicators come alive instead of looking black or faded?
  **A (user, 2026-11-27):** Stay grounded at 100% opacity + glowing inner port contacts/mouth + comic shine pool (`ComicFxLight`) + multi-LED stepped flashing — fixes the ghost-fade and dark edge shadow on exit ports (only firewall iron bars lift) and makes the open port visibly shine `(Recommended)`.
- **Q4:** How should the wire and cable variations (from floor, walls, ceiling, etc.) attach and vary across doors?
  **A (user, 2026-11-27):** 4 seeded procedural cable rigs (floor trench, side-wall conduit, ceiling bus drop, mixed ribbon+power) auto-picked by room seed & door slot — edge doors connect inward to walls/floor/ceiling naturally with zero manual level JSON edits `(Recommended)`.
- **Q5:** How should electricity, wire pulses, sparks, and beeps behave when a door/socket is powered?
  **A (user, 2026-11-27):** Continuous 12 fps traveling current pulses along wires + big spark surge and electronic power-up beep (`gate_open` + `lap_run`) on unlock + gentle periodic micro-sparks and soft ready-exit beacon beep (`kiro_crack_step`) while open — clearly shows live power flowing into the door and signals exit readiness `(Recommended)`.

## Open questions

(none)

## Verification

- `node scripts/quality/check-specs.mjs`
- `npm run quality`
- `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict --seeds 8`
- `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --strict`
- `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`
- `node scripts/harness/asset-usage.mjs`
- `npm run quality:fingerprint` (diff and explain intended asset changes)
- `npm run test` & `npm run build`
- `node scripts/harness/playthrough.mjs --ticks 3`
- `node scripts/harness/terminal-lab.mjs --all`
- `node scripts/harness/render-sheet.mjs --category door --views --out scripts/harness/out/doors.png` & `/play` headless screenshots (`node scripts/harness/screenshot-lab.mjs`)
